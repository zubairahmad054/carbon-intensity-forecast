import { NextResponse } from "next/server"
import { getSql } from "@/lib/db"
import { fetchIntensityHistory, fetchForecast48h, fetchGenerationHistory } from "@/lib/neso-api"
import { fetchAgilePrices, AGILE_REGION } from "@/lib/octopus-agile"
import { getIntensityIndex } from "@/lib/types"

// NESO's official forward forecast is stored under this version so it can sit
// alongside our own model's predictions later, and be compared against actuals.
const NESO_FORECAST_VERSION = "neso-fw48h"

export const dynamic = "force-dynamic"
export const maxDuration = 30 // ingest fans out to several upstream calls + DB writes

interface BlockStats {
  total: number
  inserted: number
  updated: number
}

export async function POST(req: Request) {
  // When INGEST_TOKEN is set (production), require it. Unset (local dev) = open.
  const token = process.env.INGEST_TOKEN
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const sql = getSql()

    // 1) Observations: last 24h of actual + NESO forecast + index. This is the
    //    primary dataset — if it fails, the whole ingest fails loudly.
    const observations = await fetchIntensityHistory(24)
    if (observations.length === 0) {
      return NextResponse.json(
        { error: "No data available from Carbon Intensity API" },
        { status: 404 }
      )
    }

    const obsParams: unknown[] = []
    const obsTuples = observations.map((r, i) => {
      const b = i * 4
      const value = r.actual ?? r.forecast ?? 0
      obsParams.push(
        r.periodStart,
        r.actual,
        r.forecast,
        r.index ?? getIntensityIndex(value)
      )
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`
    })

    const obsRows = await sql.query(
      `INSERT INTO carbon_intensity (timestamp, actual, forecast, index)
       VALUES ${obsTuples.join(", ")}
       ON CONFLICT (timestamp) DO UPDATE SET
         actual   = COALESCE(EXCLUDED.actual, carbon_intensity.actual),
         forecast = COALESCE(EXCLUDED.forecast, carbon_intensity.forecast),
         index    = EXCLUDED.index
       RETURNING (xmax = 0) AS inserted`,
      obsParams
    )
    const obsInserted = obsRows.filter((r) => r.inserted).length

    // 2-4) The secondary channels are independent of each other (separate sources,
    //      separate tables) — run them in parallel under the maxDuration cap.
    //      Each is non-fatal: a failure logs and reports zeros.
    const [forecastStats, genStats, priceStats] = await Promise.all([
      ingestNesoForecast(sql).catch((e) => {
        console.error("Forecast ingestion failed (continuing):", e)
        return { total: 0, inserted: 0, updated: 0 }
      }),
      ingestGeneration(sql).catch((e) => {
        console.error("Generation ingestion failed (continuing):", e)
        return { total: 0, inserted: 0, updated: 0 }
      }),
      ingestAgilePrices(sql).catch((e) => {
        console.error("Agile price ingestion failed (continuing):", e)
        return { total: 0, inserted: 0, updated: 0 }
      }),
    ])

    return NextResponse.json({
      success: true,
      observations: {
        total: observations.length,
        inserted: obsInserted,
        updated: observations.length - obsInserted,
      },
      forecasts: { ...forecastStats, model_version: NESO_FORECAST_VERSION },
      generation: genStats,
      prices: { ...priceStats, region: AGILE_REGION },
    })
  } catch (error) {
    console.error("Error during data ingestion:", error)
    return NextResponse.json({ error: "Failed to ingest data" }, { status: 500 })
  }
}

/** NESO's official 48h forward forecast into `forecasts`. */
async function ingestNesoForecast(sql: ReturnType<typeof getSql>): Promise<BlockStats> {
  const forecast = (await fetchForecast48h()).filter((r) => r.forecast !== null)
  if (forecast.length === 0) return { total: 0, inserted: 0, updated: 0 }

  const params: unknown[] = []
  const tuples = forecast.map((r, i) => {
    const b = i * 3
    params.push(r.periodStart, Math.round(r.forecast as number), NESO_FORECAST_VERSION)
    return `($${b + 1}, $${b + 2}, $${b + 3})`
  })
  const rows = await sql.query(
    `INSERT INTO forecasts (target_time, predicted_intensity, model_version)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (target_time, model_version) DO UPDATE SET
       predicted_intensity = EXCLUDED.predicted_intensity
     RETURNING (xmax = 0) AS inserted`,
    params
  )
  const inserted = rows.filter((r) => r.inserted).length
  return { total: forecast.length, inserted, updated: forecast.length - inserted }
}

/** Last 24h of per-fuel generation mix into `generation_mix`. */
async function ingestGeneration(sql: ReturnType<typeof getSql>): Promise<BlockStats> {
  const generation = await fetchGenerationHistory(24)
  if (generation.length === 0) return { total: 0, inserted: 0, updated: 0 }

  const params: unknown[] = []
  const tuples = generation.map((r, i) => {
    const b = i * 10
    params.push(
      r.periodStart,
      r.mix.gas,
      r.mix.coal,
      r.mix.nuclear,
      r.mix.wind,
      r.mix.solar,
      r.mix.hydro,
      r.mix.biomass,
      r.mix.imports,
      r.mix.other
    )
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10})`
  })
  const rows = await sql.query(
    `INSERT INTO generation_mix
       (timestamp, gas, coal, nuclear, wind, solar, hydro, biomass, imports, other)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (timestamp) DO UPDATE SET
       gas = EXCLUDED.gas, coal = EXCLUDED.coal, nuclear = EXCLUDED.nuclear,
       wind = EXCLUDED.wind, solar = EXCLUDED.solar, hydro = EXCLUDED.hydro,
       biomass = EXCLUDED.biomass, imports = EXCLUDED.imports, other = EXCLUDED.other
     RETURNING (xmax = 0) AS inserted`,
    params
  )
  const inserted = rows.filter((r) => r.inserted).length
  return { total: generation.length, inserted, updated: generation.length - inserted }
}

/** Half-hourly Agile unit prices into `agile_prices` (single-region series). */
async function ingestAgilePrices(sql: ReturnType<typeof getSql>): Promise<BlockStats> {
  const prices = await fetchAgilePrices(24, 48)
  if (prices.length === 0) return { total: 0, inserted: 0, updated: 0 }

  // The table holds ONE region's series. If AGILE_REGION changed since the last
  // deploy, purge the other region's rows rather than silently mixing two tariffs
  // under the same timestamps.
  await sql.query(`DELETE FROM agile_prices WHERE region <> $1`, [AGILE_REGION])

  const params: unknown[] = []
  const tuples = prices.map((r, i) => {
    const b = i * 3
    params.push(r.periodStart, AGILE_REGION, r.priceIncVat)
    return `($${b + 1}, $${b + 2}, $${b + 3})`
  })
  // created_at is refreshed on conflict so it means "last successful ingest" —
  // the freshness guard in lib/forward-signal.ts depends on that.
  const rows = await sql.query(
    `INSERT INTO agile_prices (timestamp, region, price_p_kwh)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (timestamp) DO UPDATE SET
       region = EXCLUDED.region, price_p_kwh = EXCLUDED.price_p_kwh,
       created_at = now()
     RETURNING (xmax = 0) AS inserted`,
    params
  )
  const inserted = rows.filter((r) => r.inserted).length
  return { total: prices.length, inserted, updated: prices.length - inserted }
}
