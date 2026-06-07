import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { fetchIntensityHistory } from "@/lib/neso-api"
import { getIntensityIndex, type IntensityRecord, type HistoryResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const period = searchParams.get("period") || "24h"

  // Calculate hours based on period
  let hours: number
  switch (period) {
    case "48h":
      hours = 48
      break
    case "7d":
      hours = 168
      break
    case "24h":
    default:
      hours = 24
  }

  try {
    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - hours)

    // Try the database first; fall through to the live API if it's unavailable.
    let result: Record<string, any>[] | null = null
    try {
      result = await sql`
        SELECT * FROM carbon_intensity
        WHERE timestamp >= ${cutoff.toISOString()}
        ORDER BY timestamp ASC
      `
    } catch (dbError) {
      console.warn("DB unavailable for history, using live API:", (dbError as Error).message)
    }

    let data: IntensityRecord[]

    if (result && result.length > 0) {
      data = result.map((row) => ({
        timestamp: row.timestamp,
        actual: row.actual,
        forecast: row.forecast,
        index: row.index,
      }))
    } else {
      // Fallback to the live Carbon Intensity API (already chronological)
      const live = await fetchIntensityHistory(hours)
      data = live.map((record) => ({
        timestamp: record.periodStart,
        actual: record.actual,
        forecast: record.forecast,
        index: record.index ?? (record.actual !== null ? getIntensityIndex(record.actual) : null),
      }))
    }

    const response: HistoryResponse = {
      data,
      period,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching intensity history:", error)
    return NextResponse.json(
      { data: [], period, error: "Failed to fetch carbon intensity history" },
      { status: 500 }
    )
  }
}
