/**
 * The forward signal — the shared spine every consumer reads.
 *
 * One loader joins the three half-hourly channels (forecast intensity + marginal +
 * Agile price) and applies the model-version preference, so /api/forecasts and
 * /api/schedule can never disagree about which model or which rows they serve.
 *
 * Freshness guards: a channel row older than its max age is served as null rather
 * than passed off as current — so stale prices (e.g. after an Agile product
 * retirement makes ingest 404) and stale marginal rows degrade visibly (the card
 * disables cost mode) instead of silently optimising on dead data.
 */
import { sql } from "./db"
import type { SignalPoint } from "./schedule"

const PRICE_MAX_AGE = "2 days" // re-ingested hourly; older means ingest is broken
const MARGINAL_MAX_AGE = "2 days" // forecast-map rows are rewritten nightly

export interface ForwardSignal {
  points: SignalPoint[]
  modelVersion: string | null
}

/** Prefer our own model over the NESO baseline over whatever else is present. */
export function preferModelVersion(versions: string[]): string | undefined {
  return (
    versions.find((v) => v?.startsWith("ours")) ??
    versions.find((v) => v === "neso-fw48h") ??
    versions[0]
  )
}

/**
 * Load the forward signal from now up to `hours` ahead.
 * Throws on DB failure — callers own their fallback strategy.
 */
export async function loadForwardSignal(hours = 48): Promise<ForwardSignal> {
  const now = new Date()
  const limit = new Date(now.getTime() + hours * 3_600_000)

  // method = 'forecast-map' keeps the join unambiguous now that realised
  // (merit-order) and forecast rows coexist under the composite key.
  const rows: Record<string, any>[] = await sql`
    SELECT f.target_time, f.predicted_intensity, f.model_version,
           m.marginal_gco2, p.price_p_kwh
    FROM forecasts f
    LEFT JOIN marginal_intensity m
      ON m.timestamp = f.target_time
     AND m.method = 'forecast-map'
     AND m.created_at > now() - ${MARGINAL_MAX_AGE}::interval
    LEFT JOIN agile_prices p
      ON p.timestamp = f.target_time
     AND p.created_at > now() - ${PRICE_MAX_AGE}::interval
    WHERE f.target_time >= ${now.toISOString()}
      AND f.target_time <= ${limit.toISOString()}
    ORDER BY f.target_time ASC
  `

  const versions = Array.from(new Set(rows.map((r) => r.model_version)))
  const preferred = preferModelVersion(versions)

  const points: SignalPoint[] = rows
    .filter((r) => r.model_version === preferred)
    .map((r) => ({
      target_time: r.target_time,
      intensity: Number(r.predicted_intensity),
      // NUMERIC columns arrive as strings from the driver — coerce.
      marginal: r.marginal_gco2 != null ? Number(r.marginal_gco2) : null,
      price: r.price_p_kwh != null ? Number(r.price_p_kwh) : null,
    }))

  return { points, modelVersion: preferred ?? null }
}
