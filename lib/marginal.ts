/**
 * Marginal carbon intensity from the generation mix.
 *
 * Average intensity (what NESO publishes) answers "how clean is the grid right now?".
 * MARGINAL intensity answers "what does one MORE kWh of demand emit?" — which is the
 * question that actually matters when you decide to use or shift load. The extra kWh
 * is met by the marginal (most-expensive dispatched) generator, so the marginal
 * intensity is that generator's emissions factor.
 *
 * v1 rule: a merit order. We walk the fuels from most- to least-expensive-to-run and
 * take the first one with a meaningful share as "on the margin".
 *
 * The factors, merit order and threshold live in config/fuel-factors.json — the
 * single source of truth shared with scripts/marginal.py, so the live (TS) and
 * stored (Python) marginal series cannot drift.
 */
import type { GenerationMixPoint } from "./types"
import fuelConfig from "@/config/fuel-factors.json"

type Fuel = keyof typeof fuelConfig.factors

/** Official Carbon Intensity API fuel carbon factors, gCO2/kWh. */
export const FUEL_CARBON_FACTORS: Record<Fuel, number> = fuelConfig.factors

// Most-expensive-to-run first: the marginal plant is the last one dispatched, i.e.
// the dirtiest/most-expensive flexible fuel currently running above the threshold.
const MERIT_ORDER = fuelConfig.meritOrder as Fuel[]

const SHARE_THRESHOLD = fuelConfig.shareThresholdPct // % — ignore trace amounts of a fuel

export interface MarginalEstimate {
  /** gCO2/kWh attributed to the marginal generator. */
  gco2: number
  /** Which fuel was deemed on the margin (null when the grid is effectively all low-carbon). */
  fuel: Fuel | null
}

/**
 * Estimate the marginal intensity for a half-hour from its fuel mix (% shares).
 * When only zero-carbon plant (wind/solar/nuclear/hydro) is running, the marginal
 * unit is renewable and would be curtailed — marginal ≈ 0.
 */
export function marginalFromMix(mix: GenerationMixPoint): MarginalEstimate {
  for (const fuel of MERIT_ORDER) {
    const share = mix[fuel as keyof GenerationMixPoint & Fuel] ?? 0
    if (share >= SHARE_THRESHOLD) {
      return { gco2: FUEL_CARBON_FACTORS[fuel], fuel }
    }
  }
  return { gco2: 0, fuel: null }
}
