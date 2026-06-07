"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Leaf } from "lucide-react"
import { format } from "date-fns"
import type { GenerationMixPoint } from "@/lib/types"

type FuelKey = keyof Omit<GenerationMixPoint, "timestamp">

// Display order roughly low-carbon → fossil → imports/other.
const FUELS: { key: FuelKey; label: string; color: string }[] = [
  { key: "wind", label: "Wind", color: "#0ea5e9" },
  { key: "solar", label: "Solar", color: "#facc15" },
  { key: "hydro", label: "Hydro", color: "#3b82f6" },
  { key: "nuclear", label: "Nuclear", color: "#a855f7" },
  { key: "biomass", label: "Biomass", color: "#84cc16" },
  { key: "gas", label: "Gas", color: "#6b7280" },
  { key: "coal", label: "Coal", color: "#1f2937" },
  { key: "imports", label: "Imports", color: "#94a3b8" },
  { key: "other", label: "Other", color: "#71717a" },
]

const LOW_CARBON: FuelKey[] = ["wind", "solar", "hydro", "nuclear", "biomass"]

export function GenerationMixPanel({ data }: { data: GenerationMixPoint | null }) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generation Mix</CardTitle>
          <CardDescription>What&apos;s powering the grid right now</CardDescription>
        </CardHeader>
        <CardContent className="h-32 flex items-center justify-center text-muted-foreground">
          No generation data available
        </CardContent>
      </Card>
    )
  }

  const segments = FUELS.map((f) => ({ ...f, perc: Number(data[f.key]) || 0 })).filter(
    (s) => s.perc > 0
  )
  const lowCarbon = LOW_CARBON.reduce((sum, k) => sum + (Number(data[k]) || 0), 0)
  const legend = [...segments].sort((a, b) => b.perc - a.perc)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Generation Mix</CardTitle>
            <CardDescription>
              What&apos;s powering the grid &middot; {format(new Date(data.timestamp), "HH:mm")}
            </CardDescription>
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-1.5 text-2xl font-bold text-primary">
              <Leaf className="h-5 w-5" />
              {lowCarbon.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">low-carbon</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked share bar */}
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
          {segments.map((s) => (
            <div
              key={s.key}
              style={{ width: `${s.perc}%`, backgroundColor: s.color }}
              title={`${s.label}: ${s.perc.toFixed(1)}%`}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          {legend.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-sm">
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-medium tabular-nums">{s.perc.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
