import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import type { AccuracyResponse, AccuracyStat } from "@/lib/types"

export const dynamic = "force-dynamic"

const WINDOW_DAYS = 7

function toStat(label: string, row: Record<string, any> | undefined): AccuracyStat {
  return {
    label,
    n: Number(row?.n ?? 0),
    mae: row?.mae != null ? Number(row.mae) : null,
    rmse: row?.rmse != null ? Number(row.rmse) : null,
    bias: row?.bias != null ? Number(row.bias) : null,
  }
}

export async function GET() {
  try {
    let nowcast: AccuracyStat | null = null
    let models: AccuracyStat[] = []

    try {
      // NESO's near-term forecast accuracy: every settled period carries both the
      // metered `actual` and NESO's `forecast`, so this is available immediately.
      const nc = await sql`
        SELECT count(*) AS n,
               avg(abs(actual - forecast))            AS mae,
               sqrt(avg(power(actual - forecast, 2))) AS rmse,
               avg(forecast - actual)                 AS bias
        FROM carbon_intensity
        WHERE actual IS NOT NULL AND forecast IS NOT NULL
          AND timestamp >= now() - ${`${WINDOW_DAYS} days`}::interval
      `
      if (nc[0] && Number(nc[0].n) > 0) nowcast = toStat("NESO (near-term)", nc[0])

      // Horizon forecast accuracy: join stored forward forecasts to the actuals
      // that have since settled, per model version. Generalises to our own model.
      const md = await sql`
        SELECT f.model_version                          AS label,
               count(*)                                 AS n,
               avg(abs(f.predicted_intensity - o.actual))            AS mae,
               sqrt(avg(power(f.predicted_intensity - o.actual, 2))) AS rmse,
               avg(f.predicted_intensity - o.actual)                 AS bias
        FROM forecasts f
        JOIN carbon_intensity o ON o.timestamp = f.target_time
        WHERE o.actual IS NOT NULL
        GROUP BY f.model_version
        ORDER BY f.model_version
      `
      models = md
        .filter((r: Record<string, any>) => Number(r.n) > 0)
        .map((r: Record<string, any>) => toStat(r.label, r))
    } catch (dbError) {
      console.warn("DB unavailable for accuracy:", (dbError as Error).message)
    }

    const response: AccuracyResponse = { nowcast, models, windowDays: WINDOW_DAYS }
    return NextResponse.json(response)
  } catch (error) {
    console.error("Error computing accuracy:", error)
    return NextResponse.json(
      { nowcast: null, models: [], windowDays: WINDOW_DAYS, error: "Failed to compute accuracy" },
      { status: 500 }
    )
  }
}
