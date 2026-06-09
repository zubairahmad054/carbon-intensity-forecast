/**
 * Carbon-/cost-optimal scheduling core — the "best time to run" decision layer.
 *
 * Pure functions over the forward signal (the half-hourly forecast + marginal +
 * price). Shared by the interactive scheduler card (client-side, instant) and the
 * GET /api/schedule route (server-side), so the two can never diverge.
 *
 * The scheduler never models or fetches anything: it slides a fixed-length window
 * across the signal and ranks the candidates by the chosen objective. Add a channel
 * to the signal and the scheduler can optimise it for free.
 */

const SLOT_MINUTES = 30
const SLOT_HOURS = SLOT_MINUTES / 60

export interface SignalPoint {
  target_time: string // ISO 8601, UTC — start of the half hour
  intensity: number // predicted average gCO2/kWh
  marginal: number | null // predicted marginal gCO2/kWh (null until computed)
  price: number | null // predicted unit price p/kWh inc. VAT (null outside priced horizon)
}

export type ScheduleObjective = "carbon" | "cost" | "balanced"

export interface ScheduleWindow {
  start: string // ISO — first slot of the window
  end: string // ISO — exclusive end (last slot start + 30 min)
  slots: number
  avgIntensity: number
  avgMarginal: number | null
  avgPrice: number | null
}

export interface ScheduleParams {
  durationHalfHours: number // window length in half-hour slots (>= 1)
  deadline?: string | null // window must finish at/before this ISO time
  objective?: ScheduleObjective
}

export interface RankedWindow extends ScheduleWindow {
  /** Lower is better. Comparable only within one ranking call. */
  score: number
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function summarise(slice: SignalPoint[]): ScheduleWindow {
  const hasMarginal = slice.every((p) => p.marginal != null)
  const hasPrice = slice.every((p) => p.price != null)
  return {
    start: slice[0].target_time,
    end: addMinutes(slice[slice.length - 1].target_time, SLOT_MINUTES),
    slots: slice.length,
    avgIntensity: avg(slice.map((p) => p.intensity)),
    avgMarginal: hasMarginal ? avg(slice.map((p) => p.marginal as number)) : null,
    avgPrice: hasPrice ? avg(slice.map((p) => p.price as number)) : null,
  }
}

/**
 * Rank every contiguous window of `durationHalfHours` slots that finishes by the
 * deadline, best (lowest score) first. The objective decides the score:
 *   - carbon:   average predicted intensity
 *   - cost:     average price (windows without full price coverage are dropped)
 *   - balanced: equal blend of intensity and price, each min-max normalised across
 *               the candidate set (needs price; falls back to carbon if none priced)
 */
export function rankWindows(points: SignalPoint[], params: ScheduleParams): RankedWindow[] {
  const n = Math.max(1, Math.floor(params.durationHalfHours))
  const objective = params.objective ?? "carbon"
  const deadlineMs = params.deadline ? new Date(params.deadline).getTime() : Infinity

  // Build raw candidate windows (contiguous, finishing by the deadline).
  const candidates: ScheduleWindow[] = []
  for (let i = 0; i + n <= points.length; i++) {
    const slice = points.slice(i, i + n)
    const endMs = new Date(slice[slice.length - 1].target_time).getTime() + SLOT_MINUTES * 60_000
    if (endMs > deadlineMs) continue
    candidates.push(summarise(slice))
  }
  if (candidates.length === 0) return []

  const priced = candidates.filter((w) => w.avgPrice != null)
  const useCost = (objective === "cost" || objective === "balanced") && priced.length > 0
  const pool = objective === "cost" ? priced : candidates

  // Normalisation bounds for the balanced objective.
  const iVals = pool.map((w) => w.avgIntensity)
  const pVals = priced.map((w) => w.avgPrice as number)
  const norm = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0)
  const iLo = Math.min(...iVals)
  const iHi = Math.max(...iVals)
  const pLo = pVals.length ? Math.min(...pVals) : 0
  const pHi = pVals.length ? Math.max(...pVals) : 0

  const scored = pool.map((w): RankedWindow => {
    let score: number
    if (objective === "cost") {
      score = w.avgPrice as number
    } else if (objective === "balanced" && useCost && w.avgPrice != null) {
      score = 0.5 * norm(w.avgIntensity, iLo, iHi) + 0.5 * norm(w.avgPrice, pLo, pHi)
    } else {
      score = w.avgIntensity // carbon (and balanced fallback when nothing is priced)
    }
    return { ...w, score }
  })

  return scored.sort((a, b) => a.score - b.score)
}

export interface WindowSavings {
  /** Attributional basis: cleaner grid average at the window (how footprints are usually counted). */
  co2KgAverage: number
  /** Consequential basis: change in what the MARGINAL plant emits (often ~0 when gas sets the margin both times). */
  co2KgMarginal: number | null
  /** Money saved vs running now (uses price); null when unpriced. */
  costGbp: number | null
}

/**
 * Savings from running `powerKw` for the window instead of starting at `baseline`
 * (the earliest feasible window — i.e. "run now"). We report two honest bases:
 *
 *   - AVERAGE (attributional): the grid is cleaner in the window, so the electricity
 *     you consume "carries" less CO2 — how a carbon footprint is conventionally counted.
 *   - MARGINAL (consequential): the change in emissions your extra demand actually
 *     CAUSES. In a gas-dominated grid the marginal plant is gas in both windows, so
 *     this is frequently near zero — the nuance NESO's average-only view hides.
 */
export function windowSavings(
  powerKw: number,
  window: ScheduleWindow,
  baseline: ScheduleWindow,
): WindowSavings {
  const energyKwh = powerKw * window.slots * SLOT_HOURS
  const co2KgAverage = (energyKwh * (baseline.avgIntensity - window.avgIntensity)) / 1000
  const co2KgMarginal =
    window.avgMarginal != null && baseline.avgMarginal != null
      ? (energyKwh * (baseline.avgMarginal - window.avgMarginal)) / 1000
      : null
  const costGbp =
    window.avgPrice != null && baseline.avgPrice != null
      ? (energyKwh * (baseline.avgPrice - window.avgPrice)) / 100 // pence → £
      : null
  return { co2KgAverage, co2KgMarginal, costGbp }
}
