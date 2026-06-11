import { NextResponse } from "next/server"
import { loadForwardSignal } from "@/lib/forward-signal"
import {
  rankWindows,
  windowSavings,
  baselineWindow,
  type ScheduleObjective,
  type RankedWindow,
} from "@/lib/schedule"

export const dynamic = "force-dynamic"

const OBJECTIVES: ScheduleObjective[] = ["carbon", "cost", "balanced"]

/**
 * "Best time to run" — the decision layer over the forward signal.
 *
 * GET /api/schedule?power=7&duration=3&deadline=ISO&objective=carbon|cost|balanced
 *
 * Reads the shared forward signal (forecast + marginal + price) and slides a
 * window across it. Ranking and the "run now" baseline live in lib/schedule.ts,
 * shared with the dashboard card so the two can never disagree.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const powerKw = clampNum(url.searchParams.get("power"), 7, 0.1, 1000)
  const durationH = clampNum(url.searchParams.get("duration"), 2, 0.5, 24)
  const rawObjective = url.searchParams.get("objective")
  const objective: ScheduleObjective = OBJECTIVES.includes(rawObjective as ScheduleObjective)
    ? (rawObjective as ScheduleObjective)
    : "carbon"
  const deadline = parseDeadline(url.searchParams.get("deadline"))
  const durationHalfHours = Math.max(1, Math.round(durationH * 2))

  try {
    let signal: Awaited<ReturnType<typeof loadForwardSignal>>["points"] = []
    try {
      signal = (await loadForwardSignal(48)).points
    } catch (dbError) {
      console.warn("DB unavailable for schedule:", (dbError as Error).message)
    }

    if (signal.length < durationHalfHours) {
      return NextResponse.json({
        windows: [],
        baseline: null,
        objective,
        priced: false,
        message: "Not enough forecast data for that duration yet.",
      })
    }

    const priced = signal.some((p) => p.price != null)
    const ranked = rankWindows(signal, { durationHalfHours, deadline, objective })
    const baseline = baselineWindow(signal, durationHalfHours)

    const withSavings = ranked.slice(0, 5).map((w: RankedWindow) => ({
      ...w,
      savings: baseline ? windowSavings(powerKw, w, baseline) : null,
    }))

    return NextResponse.json({
      windows: withSavings,
      baseline,
      objective,
      priced,
      // Cost/balanced degrade to carbon ranking when nothing is priced — say so
      // instead of returning an unexplained result.
      message:
        !priced && objective !== "carbon"
          ? "No price data in the horizon yet — ranked by carbon instead."
          : ranked.length === 0
            ? "No window fits before that deadline."
            : undefined,
      params: { powerKw, durationH, durationHalfHours, deadline },
    })
  } catch (error) {
    console.error("Error computing schedule:", error)
    return NextResponse.json(
      { windows: [], baseline: null, objective, priced: false, error: "Failed to compute schedule" },
      { status: 500 },
    )
  }
}

function clampNum(raw: string | null, fallback: number, lo: number, hi: number): number {
  const n = raw == null ? NaN : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, lo), hi)
}

/** Reject unparseable deadlines up front (rankWindows would ignore them anyway). */
function parseDeadline(raw: string | null): string | null {
  if (!raw) return null
  return Number.isFinite(new Date(raw).getTime()) ? raw : null
}
