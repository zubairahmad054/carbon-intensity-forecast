import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import {
  rankWindows,
  windowSavings,
  type SignalPoint,
  type ScheduleObjective,
  type RankedWindow,
  type ScheduleWindow,
} from "@/lib/schedule"

export const dynamic = "force-dynamic"

/**
 * "Best time to run" — the decision layer over the forward signal.
 *
 * GET /api/schedule?power=7&duration=3&deadline=ISO&objective=carbon|cost|balanced
 *
 * Reads the three-channel forward signal (forecast intensity + marginal + price)
 * straight from Neon and slides a window across it. Pure ranking lives in
 * lib/schedule.ts, shared with the interactive card so they can't diverge.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const powerKw = clampNum(url.searchParams.get("power"), 7, 0.1, 1000)
  const durationH = clampNum(url.searchParams.get("duration"), 2, 0.5, 24)
  const objective = (url.searchParams.get("objective") as ScheduleObjective) || "carbon"
  const deadline = url.searchParams.get("deadline")
  const durationHalfHours = Math.max(1, Math.round(durationH * 2))

  try {
    let rows: Record<string, any>[] = []
    try {
      rows = await sql`
        SELECT f.target_time, f.predicted_intensity, f.model_version,
               m.marginal_gco2, p.price_p_kwh
        FROM forecasts f
        LEFT JOIN marginal_intensity m ON m.timestamp = f.target_time
        LEFT JOIN agile_prices p ON p.timestamp = f.target_time
        WHERE f.target_time >= now()
        ORDER BY f.target_time ASC
      `
    } catch (dbError) {
      console.warn("DB unavailable for schedule:", (dbError as Error).message)
    }

    // Prefer our own model over the NESO baseline, like /api/forecasts does.
    const versions = Array.from(new Set(rows.map((r) => r.model_version)))
    const preferred =
      versions.find((v) => v?.startsWith("ours")) ??
      versions.find((v) => v === "neso-fw48h") ??
      versions[0]

    const signal: SignalPoint[] = rows
      .filter((r) => r.model_version === preferred)
      .map((r) => ({
        target_time: r.target_time,
        intensity: Number(r.predicted_intensity),
        marginal: r.marginal_gco2 != null ? Number(r.marginal_gco2) : null,
        price: r.price_p_kwh != null ? Number(r.price_p_kwh) : null,
      }))

    if (signal.length < durationHalfHours) {
      return NextResponse.json({
        windows: [],
        baseline: null,
        objective,
        priced: false,
        message: "Not enough forecast data for that duration yet.",
      })
    }

    const ranked = rankWindows(signal, { durationHalfHours, deadline, objective })
    // Baseline = "run now": the earliest window of the same length.
    const baseline = rankWindows(signal, { durationHalfHours, objective: "carbon" }).find(
      (w) => w.start === signal[0].target_time,
    )

    const withSavings = ranked.slice(0, 5).map((w: RankedWindow) => ({
      ...w,
      savings: baseline ? windowSavings(powerKw, w, baseline) : null,
    }))

    return NextResponse.json({
      windows: withSavings,
      baseline: (baseline ?? null) as ScheduleWindow | null,
      objective,
      priced: signal.some((p) => p.price != null),
      params: { powerKw, durationH, durationHalfHours },
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
