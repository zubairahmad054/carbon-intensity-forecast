"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, Zap, Leaf } from "lucide-react"
import type { ForecastPoint } from "@/lib/types"
import { format } from "date-fns"

interface BestTimePanelProps {
  forecasts: ForecastPoint[]
  className?: string
}

function findBestWindows(forecasts: ForecastPoint[], count: number = 3) {
  if (forecasts.length === 0) return []
  
  const sorted = [...forecasts].sort((a, b) => a.predicted_intensity - b.predicted_intensity)
  return sorted.slice(0, count)
}

export function BestTimePanel({ forecasts, className }: BestTimePanelProps) {
  const bestWindows = findBestWindows(forecasts, 3)

  if (bestWindows.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-primary" />
            Best Time to Use Electricity
          </CardTitle>
          <CardDescription>
            Recommendations based on forecasted carbon intensity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No forecast data available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Leaf className="h-5 w-5 text-primary" />
          Best Time to Use Electricity
        </CardTitle>
        <CardDescription>
          Schedule high-energy tasks during these low-carbon windows
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {bestWindows.map((window, idx) => {
          const time = new Date(window.target_time)
          const isFirst = idx === 0

          return (
            <div
              key={window.target_time}
              className={`flex items-center gap-4 p-3 rounded-lg ${
                isFirst
                  ? "bg-primary/10 ring-1 ring-primary/20"
                  : "bg-muted/50"
              }`}
            >
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  isFirst ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {isFirst ? (
                  <Zap className="h-5 w-5" />
                ) : (
                  <Clock className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium">
                  {format(time, "EEEE, MMM d")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {format(time, "HH:mm")} - {window.predicted_intensity} gCO2/kWh
                </div>
              </div>
              {isFirst && (
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                  Recommended
                </span>
              )}
            </div>
          )
        })}

        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            <strong>Tip:</strong> Running appliances like washing machines, dishwashers, 
            or EV chargers during low-carbon periods helps reduce your carbon footprint.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
