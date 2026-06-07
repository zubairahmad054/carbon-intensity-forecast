"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ModelMetrics } from "@/lib/types"
import { format } from "date-fns"
import { Activity, Target, TrendingUp, Database, Info, ArrowLeft } from "lucide-react"

interface ModelMetricsCardProps {
  metrics: ModelMetrics | null
  className?: string
}

export function ModelMetricsCard({ metrics, className }: ModelMetricsCardProps) {
  const [showInfo, setShowInfo] = useState(false)

  if (!metrics) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Model Performance
          </CardTitle>
          <CardDescription>ML model training metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No model trained yet</p>
        </CardContent>
      </Card>
    )
  }

  const mae = metrics.mae
  const rmse = metrics.rmse
  const r2 = metrics.r2_score

  const metricsData = [
    {
      label: "MAE",
      value: mae != null ? mae.toFixed(2) : "N/A",
      description: "Mean Absolute Error",
      icon: Target,
    },
    {
      label: "RMSE",
      value: rmse != null ? rmse.toFixed(2) : "N/A",
      description: "Root Mean Square Error",
      icon: TrendingUp,
    },
    {
      label: "R² Score",
      value: r2 != null ? r2.toFixed(3) : "N/A",
      description: "Coefficient of Determination",
      icon: Activity,
    },
    {
      label: "Samples",
      value: metrics.training_samples != null ? metrics.training_samples.toLocaleString() : "N/A",
      description: "Training data points",
      icon: Database,
    },
  ]

  // Explanations tied to the live numbers, framed for carbon intensity.
  const explanations = [
    {
      icon: Target,
      label: "MAE — Mean Absolute Error",
      what: "On average, how far the forecast lands from the real grid intensity.",
      here:
        mae != null
          ? `Yours is ${mae.toFixed(1)} gCO₂/kWh: a forecast is typically within ±${mae.toFixed(
              0
            )} of the actual value. GB intensity spans ~50–400, so lower is better and more trustworthy.`
          : "Not available yet.",
    },
    {
      icon: TrendingUp,
      label: "RMSE — Root Mean Square Error",
      what: "Like MAE, but it punishes big misses much more than small ones.",
      here:
        rmse != null && mae != null
          ? rmse > mae * 1.3
            ? `Yours (${rmse.toFixed(1)}) is noticeably above the MAE (${mae.toFixed(
                1
              )}), meaning the model is usually close but occasionally makes large errors — typically around sudden wind swings the model can't see.`
            : `Yours (${rmse.toFixed(1)}) is close to the MAE, meaning errors are fairly consistent with no big surprises.`
          : "Not available yet.",
    },
    {
      icon: Activity,
      label: "R² — Coefficient of Determination",
      what: "The share of the grid's ups and downs (0–100%) the model actually explains.",
      here:
        r2 != null
          ? `Yours is ${(r2 * 100).toFixed(0)}%: the model captures about ${(r2 * 100).toFixed(
              0
            )}% of how carbon intensity moves; the rest is weather surprises and grid events it doesn't yet see. 100% would be perfect.`
          : "Not available yet.",
    },
  ]

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Model Performance
            </CardTitle>
            <CardDescription className="mt-1">
              {showInfo ? (
                "What these numbers mean"
              ) : (
                <>
                  Version {metrics.model_version} · Trained{" "}
                  {metrics.trained_at
                    ? format(new Date(metrics.trained_at), "MMM d, yyyy")
                    : "Unknown"}
                </>
              )}
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            aria-label={showInfo ? "Back to metrics" : "What do these metrics mean?"}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {showInfo ? <ArrowLeft className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {showInfo ? (
          <div className="space-y-4">
            {explanations.map((e) => (
              <div key={e.label} className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <e.icon className="h-4 w-4 text-primary" />
                  {e.label}
                </div>
                <p className="text-sm text-muted-foreground">{e.what}</p>
                <p className="text-sm">{e.here}</p>
              </div>
            ))}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Bottom line: the lower the MAE/RMSE and the higher the R², the more you can trust the
              forecast and the “best time to use electricity” guidance.
            </p>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowInfo(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setShowInfo(true)
            }}
            className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="grid grid-cols-2 gap-4">
              {metricsData.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </div>
                  <div className="text-2xl font-bold">{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              Tap to learn what these mean
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
