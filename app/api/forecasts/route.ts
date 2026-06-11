import { NextResponse } from "next/server"
import { loadForwardSignal } from "@/lib/forward-signal"
import type { ForecastPoint, ForecastResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // The shared forward-signal loader (same one /api/schedule uses) joins our
    // forecast with the marginal and price channels and applies the model-version
    // preference. Fall through to demo data only if the DB is unavailable/empty.
    let forecasts: ForecastPoint[] | null = null
    let modelVersion: string | null = null
    try {
      const signal = await loadForwardSignal(48)
      if (signal.points.length > 0) {
        forecasts = signal.points.map((p) => ({
          target_time: p.target_time,
          predicted_intensity: p.intensity,
          marginal: p.marginal,
          price: p.price,
        }))
        modelVersion = signal.modelVersion
      }
    } catch (dbError) {
      console.warn("DB unavailable for forecasts, using demo data:", (dbError as Error).message)
    }

    if (!forecasts) {
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
