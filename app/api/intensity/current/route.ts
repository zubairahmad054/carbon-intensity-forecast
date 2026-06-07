import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { fetchLatestIntensity } from "@/lib/neso-api"
import { getIntensityIndex, type CurrentIntensityResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Try the database first; fall through to the live API if it's unavailable.
    let result: Record<string, any>[] | null = null
    try {
      result = await sql`
        SELECT * FROM carbon_intensity
        ORDER BY timestamp DESC
        LIMIT 2
      `
    } catch (dbError) {
      console.warn("DB unavailable for current intensity, using live API:", (dbError as Error).message)
    }

    let currentData = null
    let previousActual: number | null = null

    if (result && result.length > 0) {
      const current = result[0]
      previousActual = result[1]?.actual ?? null
      const value = current.actual ?? current.forecast ?? 0
      currentData = {
        timestamp: current.timestamp,
        actual: current.actual,
        forecast: current.forecast,
        index: current.index ?? getIntensityIndex(value),
        trend: calculateTrend(value, previousActual),
      }
    } else {
      // Fallback to the live Carbon Intensity API if the database is empty
      const latest = await fetchLatestIntensity()
      if (latest) {
        const value = latest.actual ?? latest.forecast ?? 0
        currentData = {
          timestamp: latest.periodStart,
          actual: latest.actual,
          forecast: latest.forecast,
          index: latest.index ?? getIntensityIndex(value),
          trend: "stable" as const,
        }
      }
    }

    const response: CurrentIntensityResponse = {
      data: currentData,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching current intensity:", error)
    return NextResponse.json(
      { data: null, error: "Failed to fetch carbon intensity data" },
      { status: 500 }
    )
  }
}

function calculateTrend(current: number, previous: number | null): "rising" | "falling" | "stable" {
  if (previous === null) return "stable"
  const diff = current - previous
  if (diff > 5) return "rising"
  if (diff < -5) return "falling"
  return "stable"
}
