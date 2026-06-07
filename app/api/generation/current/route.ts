import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { fetchCurrentGeneration } from "@/lib/neso-api"
import type { GenerationMixPoint, GenerationMixResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Try the database first; fall through to the live API if it's unavailable.
    let row: Record<string, any> | null = null
    try {
      const rows = await sql`
        SELECT * FROM generation_mix
        ORDER BY timestamp DESC
        LIMIT 1
      `
      row = rows[0] ?? null
    } catch (dbError) {
      console.warn("DB unavailable for generation mix, using live API:", (dbError as Error).message)
    }

    let data: GenerationMixPoint | null = null

    if (row) {
      // NUMERIC columns come back as strings from the driver — coerce to number.
      data = {
        timestamp: row.timestamp,
        gas: Number(row.gas),
        coal: Number(row.coal),
        nuclear: Number(row.nuclear),
        wind: Number(row.wind),
        solar: Number(row.solar),
        hydro: Number(row.hydro),
        biomass: Number(row.biomass),
        imports: Number(row.imports),
        other: Number(row.other),
      }
    } else {
      const live = await fetchCurrentGeneration()
      if (live) {
        data = { timestamp: live.periodStart, ...live.mix }
      }
    }

    const response: GenerationMixResponse = { data }
    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching generation mix:", error)
    return NextResponse.json(
      { data: null, error: "Failed to fetch generation mix" },
      { status: 500 }
    )
  }
}
