"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IntensityGauge } from "@/components/intensity-gauge"
import { AlertCircle, Info, ArrowLeft } from "lucide-react"
import { getIntensityIndex, type CurrentIntensityResponse } from "@/lib/types"

type CurrentData = NonNullable<CurrentIntensityResponse["data"]>

interface CurrentIntensityCardProps {
  data: CurrentData | null | undefined
  isLoading?: boolean
  error?: unknown
}

type Mode = "average" | "marginal"

export function CurrentIntensityCard({ data, isLoading, error }: CurrentIntensityCardProps) {
  const [mode, setMode] = useState<Mode>("average")
  const [showInfo, setShowInfo] = useState(false)

  const marginal = data?.marginal ?? null
  const average = data?.actual ?? data?.forecast ?? null
  const canMarginal = marginal != null

  const showMarginal = mode === "marginal" && canMarginal
  const value = showMarginal ? (marginal as number) : (average ?? 0)
  const index = showMarginal ? getIntensityIndex(marginal as number) : data?.index ?? "moderate"

  return (
    <Card className="h-full">
      <CardHeader className="text-center">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 text-center">
            <CardTitle>Current Intensity</CardTitle>
            <CardDescription>
              {showInfo ? "Average vs marginal" : "Live carbon intensity reading"}
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            aria-label={showInfo ? "Back" : "What is marginal intensity?"}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {showInfo ? <ArrowLeft className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        {showInfo ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-medium">Average intensity</div>
              <p className="text-muted-foreground">
                The grid's emissions per kWh right now, across all generation — the number NESO
                publishes.
              </p>
            </div>
            <div>
              <div className="font-medium">Marginal intensity</div>
              <p className="text-muted-foreground">
                What <strong>one extra kWh</strong> would emit — met by the marginal (most-expensive
                dispatched) plant, almost always gas. It's usually higher than the average, and it's
                the honest number for deciding whether to use or shift power.
              </p>
            </div>
            <p className="border-t pt-2 text-xs text-muted-foreground">
              Estimated from the live generation mix using the official Carbon Intensity fuel
              factors.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading...</div>
          </div>
        ) : error ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <span>Failed to load data</span>
          </div>
        ) : data ? (
          <>
            <IntensityGauge value={Math.round(value)} index={index} />
            <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setMode("average")}
                className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  !showMarginal ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Average
              </button>
              <button
                type="button"
                disabled={!canMarginal}
                onClick={() => setMode("marginal")}
                title={canMarginal ? undefined : "Marginal needs the generation mix"}
                className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  showMarginal ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                } ${!canMarginal ? "cursor-not-allowed opacity-40" : ""}`}
              >
                Marginal
              </button>
            </div>
            {canMarginal && (
              <p className="text-center text-xs text-muted-foreground">
                {showMarginal
                  ? "Emissions of one extra kWh right now"
                  : `One extra kWh would emit ~${Math.round(marginal as number)} gCO₂`}
              </p>
            )}
          </>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <span>No data available</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
