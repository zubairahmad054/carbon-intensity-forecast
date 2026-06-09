import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import type { ForecastPoint, ForecastResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Get forecasts for the next 48 hours, preferring the most recently produced
    // model version present in the table.
    const now = new Date()
    const futureLimit = new Date()
    futureLimit.setHours(futureLimit.getHours() + 48)

    // Try the database first; fall through to demo data if it's unavailable.
    // Marginal intensity (#2) and Agile price (#3) join onto the same half-hour grid,
    // so the forecast becomes the three-channel "forward signal" the scheduler reads.
    let result: Record<string, any>[] | null = null
    try {
      result = await sql`
        SELECT f.target_time, f.predicted_intensity, f.model_version,
               m.marginal_gco2, p.price_p_kwh
        FROM forecasts f
        LEFT JOIN marginal_intensity m ON m.timestamp = f.target_time
        LEFT JOIN agile_prices p ON p.timestamp = f.target_time
        WHERE f.target_time >= ${now.toISOString()}
          AND f.target_time <= ${futureLimit.toISOString()}
        ORDER BY f.target_time ASC
      `
    } catch (dbError) {
      console.warn("DB unavailable for forecasts, using demo data:", (dbError as Error).message)
    }

    let forecasts: ForecastPoint[]
    let modelVersion: string

    if (result && result.length > 0) {
      // Multiple model versions may overlap the window (NESO baseline + our model).
      // Prefer our own model ("ours-…") over the NESO baseline so the chart shows
      // the model we're proud of; the accuracy card still benchmarks both.
      const versions = Array.from(new Set(result.map((r) => r.model_version)))
      const preferred =
        versions.find((v) => v.startsWith("ours")) ??
        versions.find((v) => v === "neso-fw48h") ??
        versions[0]

      forecasts = result
        .filter((row) => row.model_version === preferred)
        .map((row) => ({
          target_time: row.target_time,
          predicted_intensity: Number(row.predicted_intensity),
          // NUMERIC columns arrive as strings from the driver — coerce.
          marginal: row.marginal_gco2 != null ? Number(row.marginal_gco2) : null,
          price: row.price_p_kwh != null ? Number(row.price_p_kwh) : null,
        }))
      modelVersion = preferred
    } else {
      // Demo data only when the table is genuinely empty (e.g. before first ingest).
      forecasts = generateDemoForecasts()
      modelVersion = "demo"
    }

    const response: ForecastResponse = {
      data: forecasts,
      model_version: modelVersion,
      generated_at: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching forecasts:", error)
    return NextResponse.json(
      { data: [], model_version: null, generated_at: null, error: "Failed to fetch forecasts" },
      { status: 500 }
    )
  }
}

function generateDemoForecasts(): ForecastPoint[] {
  const forecasts: ForecastPoint[] = []
  const now = new Date()
  
  // Generate 48 hours of forecasts at 30-minute intervals
  for (let i = 0; i < 96; i++) {
    const targetTime = new Date(now)
    targetTime.setMinutes(Math.floor(now.getMinutes() / 30) * 30, 0, 0)
    targetTime.setMinutes(targetTime.getMinutes() + i * 30)

    // Simulate realistic UK grid patterns
    const hour = targetTime.getHours()
    const dayOfWeek = targetTime.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    // Base intensity varies by time of day
    let baseIntensity: number
    if (hour >= 0 && hour < 6) {
      baseIntensity = 120 // Low overnight
    } else if (hour >= 6 && hour < 9) {
      baseIntensity = 180 // Morning ramp-up
    } else if (hour >= 9 && hour < 16) {
      baseIntensity = 160 // Daytime (solar helps)
    } else if (hour >= 16 && hour < 20) {
      baseIntensity = 220 // Evening peak
    } else {
      baseIntensity = 150 // Evening decline
    }

    // Weekend adjustment (lower demand)
    if (isWeekend) {
      baseIntensity *= 0.85
    }

    // Add some randomness
    const noise = (Math.random() - 0.5) * 40
    const predictedIntensity = Math.round(Math.max(50, baseIntensity + noise))

    forecasts.push({
      target_time: targetTime.toISOString(),
      predicted_intensity: predictedIntensity,
      marginal: null,
      price: null,
    })
  }

  return forecasts
}
