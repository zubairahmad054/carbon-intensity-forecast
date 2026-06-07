import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import type { ModelMetrics, ModelMetricsResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // No model trained yet (or DB unavailable) → return null rather than erroring,
    // so the dashboard's model card degrades gracefully.
    let result: Record<string, any>[] | null = null
    try {
      result = await sql`
        SELECT * FROM model_metrics
        ORDER BY trained_at DESC
        LIMIT 1
      `
    } catch (dbError) {
      console.warn("DB unavailable for metrics:", (dbError as Error).message)
    }

    let metrics: ModelMetrics | null = null

    if (result && result.length > 0) {
      const row = result[0]
      // NUMERIC/BIGINT columns come back from the driver as strings — coerce to
      // numbers so the type contract holds and the card's .toFixed() works.
      metrics = {
        id: Number(row.id),
        model_version: row.model_version,
        trained_at: row.trained_at,
        mae: row.mae != null ? Number(row.mae) : null,
        rmse: row.rmse != null ? Number(row.rmse) : null,
        r2_score: row.r2_score != null ? Number(row.r2_score) : null,
        training_samples: row.training_samples != null ? Number(row.training_samples) : null,
      }
    }

    const response: ModelMetricsResponse = {
      data: metrics,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching model metrics:", error)
    return NextResponse.json(
      { data: null, error: "Failed to fetch model metrics" },
      { status: 500 }
    )
  }
}
