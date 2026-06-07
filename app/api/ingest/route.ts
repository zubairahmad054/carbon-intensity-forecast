import { NextResponse } from "next/server"
import { getSql } from "@/lib/db"
import { fetchIntensityHistory, fetchForecast48h, fetchGenerationHistory } from "@/lib/neso-api"
import { getIntensityIndex } from "@/lib/types"

// NESO's official forward forecast is stored under this version so it can sit
// alongside our own model's predictions later, and be compared against actuals.
const NESO_FORECAST_VERSION = "neso-fw48h"

export const dynamic = "force-dynamic"
export const maxDuration = 30 // ingest fans out to several upstream calls + DB writes

export async function POST(req: Request) {
  // When INGEST_TOKEN is set (production), require it. Unset (local dev) = open.
  const token = process.env.INGEST_TOKEN
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const sql = getSql()

    // 1) Observations: last 24h of actual + NESO forecast + index.
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

    // 2) Forecasts: NESO's official 48h forward forecast (non-fatal if it fails).
    let forecastInserted = 0
    let forecastTotal = 0
    try {
      const forecast = (await fetchForecast48h()).filter((r) => r.forecast !== null)
      forecastTotal = forecast.length
      if (forecast.length > 0) {
        const fParams: unknown[] = []
        const fTuples = forecast.map((r, i) => {
          const b = i * 2
          fParams.push(r.periodStart, Math.round(r.forecast as number))
          return `($${b + 1}, $${b + 2}, '${NESO_FORECAST_VERSION}')`
        })
        const fRows = await sql.query(
          `INSERT INTO forecasts (target_time, predicted_intensity, model_version)
           VALUES ${fTuples.join(", ")}
           ON CONFLICT (target_time, model_version) DO UPDATE SET
             predicted_intensity = EXCLUDED.predicted_intensity
           RETURNING (xmax = 0) AS inserted`,
          fParams
        )
        forecastInserted = fRows.filter((r) => r.inserted).length
      }
    } catch (e) {
      console.error("Forecast ingestion failed (continuing):", e)
    }

    // 3) Generation mix: last 24h of per-fuel % (non-fatal if it fails).
    let genInserted = 0
    let genTotal = 0
    try {
      const generation = await fetchGenerationHistory(24)
      genTotal = generation.length
      if (generation.length > 0) {
        const gParams: unknown[] = []
        const gTuples = generation.map((r, i) => {
          const b = i * 10
          gParams.push(
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
        const gRows = await sql.query(
          `INSERT INTO generation_mix
             (timestamp, gas, coal, nuclear, wind, solar, hydro, biomass, imports, other)
           VALUES ${gTuples.join(", ")}
           ON CONFLICT (timestamp) DO UPDATE SET
             gas = EXCLUDED.gas, coal = EXCLUDED.coal, nuclear = EXCLUDED.nuclear,
             wind = EXCLUDED.wind, solar = EXCLUDED.solar, hydro = EXCLUDED.hydro,
             biomass = EXCLUDED.biomass, imports = EXCLUDED.imports, other = EXCLUDED.other
           RETURNING (xmax = 0) AS inserted`,
          gParams
        )
        genInserted = gRows.filter((r) => r.inserted).length
      }
    } catch (e) {
      console.error("Generation ingestion failed (continuing):", e)
    }

    return NextResponse.json({
      success: true,
      observations: {
        total: observations.length,
        inserted: obsInserted,
        updated: observations.length - obsInserted,
      },
      forecasts: {
        total: forecastTotal,
        inserted: forecastInserted,
        updated: forecastTotal - forecastInserted,
        model_version: NESO_FORECAST_VERSION,
      },
      generation: {
        total: genTotal,
        inserted: genInserted,
        updated: genTotal - genInserted,
      },
    })
  } catch (error) {
    console.error("Error during data ingestion:", error)
    return NextResponse.json({ error: "Failed to ingest data" }, { status: 500 })
  }
}
