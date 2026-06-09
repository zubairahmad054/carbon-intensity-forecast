"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { ForecastChart } from "@/components/forecast-chart"
import { HistoryChart } from "@/components/history-chart"
import { SchedulerCard } from "@/components/scheduler-card"
import { CurrentIntensityCard } from "@/components/current-intensity-card"
import { ModelMetricsCard } from "@/components/model-metrics-card"
import { GenerationMixPanel } from "@/components/generation-mix-panel"
import { AccuracyCard } from "@/components/accuracy-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, Zap, AlertCircle } from "lucide-react"

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-1.7c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 5 18.3 5.3 18.3 5.3c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  )
}
import type { CurrentIntensityResponse, ForecastResponse, HistoryResponse, ModelMetricsResponse, GenerationMixResponse, AccuracyResponse } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function Dashboard() {
  const { data: currentData, error: currentError, isLoading: currentLoading, mutate: mutateCurrent } = 
    useSWR<CurrentIntensityResponse>("/api/intensity/current", fetcher, { refreshInterval: 30000 })
  
  const { data: forecastData, error: forecastError, isLoading: forecastLoading, mutate: mutateForecast } = 
    useSWR<ForecastResponse>("/api/forecasts", fetcher, { refreshInterval: 60000 })
  
  const { data: historyData, error: historyError, isLoading: historyLoading, mutate: mutateHistory } = 
    useSWR<HistoryResponse>("/api/intensity/history", fetcher, { refreshInterval: 60000 })
  
  const { data: metricsData, mutate: mutateMetrics } =
    useSWR<ModelMetricsResponse>("/api/metrics", fetcher)

  const { data: generationData, mutate: mutateGeneration } =
    useSWR<GenerationMixResponse>("/api/generation/current", fetcher, { refreshInterval: 60000 })

  const { data: accuracyData, mutate: mutateAccuracy } =
    useSWR<AccuracyResponse>("/api/accuracy", fetcher, { refreshInterval: 300000 })

  // The scheduler picks a window; the forecast chart shades it. One shared piece of
  // state keeps the decision and the chart in sync.
  const [scheduledWindow, setScheduledWindow] = useState<{ start: string; end: string } | null>(null)
  const handleWindowChange = useCallback(
    (w: { start: string; end: string } | null) => setScheduledWindow(w),
    [],
  )

  const refreshAll = () => {
    mutateCurrent()
    mutateForecast()
    mutateHistory()
    mutateMetrics()
    mutateGeneration()
    mutateAccuracy()
  }

  const currentIntensity = currentData?.data
  const forecasts = forecastData?.data ?? []
  const history = historyData?.data ?? []
  const metrics = metricsData?.data ?? null
  const generation = generationData?.data ?? null
  const accuracy = accuracyData ?? null

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">UK Grid Carbon Intensity</h1>
              <p className="text-sm text-muted-foreground">Real-time forecasting dashboard</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAll} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Current Intensity (with Average / Marginal toggle) */}
          <div className="lg:col-span-1">
            <CurrentIntensityCard
              data={currentIntensity}
              isLoading={currentLoading}
              error={currentError}
            />
          </div>

          {/* Scheduler — the "best time to run" decision layer */}
          <div className="lg:col-span-2">
            <SchedulerCard forecasts={forecasts} onWindowChange={handleWindowChange} />
          </div>

          {/* Forecast Chart - spans 2 columns */}
          <div className="lg:col-span-2">
            {forecastLoading ? (
              <Card>
                <CardHeader>
                  <CardTitle>48-Hour Forecast</CardTitle>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center">
                  <div className="animate-pulse text-muted-foreground">Loading forecast...</div>
                </CardContent>
              </Card>
            ) : forecastError ? (
              <Card>
                <CardHeader>
                  <CardTitle>48-Hour Forecast</CardTitle>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center">
                  <div className="text-muted-foreground flex flex-col items-center gap-2">
                    <AlertCircle className="h-8 w-8" />
                    <span>Failed to load forecast</span>
                  </div>
                </CardContent>
              </Card>
            ) : forecasts.length > 0 ? (
              <ForecastChart data={forecasts} highlight={scheduledWindow} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>48-Hour Forecast</CardTitle>
                  <CardDescription>No forecast data available. Train an ML model to generate predictions.</CardDescription>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center">
                  <div className="text-muted-foreground">Awaiting ML model predictions</div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Model Metrics */}
          <div className="lg:col-span-1">
            <ModelMetricsCard metrics={metrics} />
          </div>

          {/* Generation Mix - Full width */}
          <div className="lg:col-span-3">
            <GenerationMixPanel data={generation} />
          </div>

          {/* Forecast Accuracy - Full width */}
          <div className="lg:col-span-3">
            <AccuracyCard data={accuracy} />
          </div>

          {/* History Chart - Full width */}
          <div className="lg:col-span-3">
            {historyLoading ? (
              <Card>
                <CardHeader>
                  <CardTitle>Historical Intensity</CardTitle>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center">
                  <div className="animate-pulse text-muted-foreground">Loading history...</div>
                </CardContent>
              </Card>
            ) : historyError ? (
              <Card>
                <CardHeader>
                  <CardTitle>Historical Intensity</CardTitle>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center">
                  <div className="text-muted-foreground flex flex-col items-center gap-2">
                    <AlertCircle className="h-8 w-8" />
                    <span>Failed to load history</span>
                  </div>
                </CardContent>
              </Card>
            ) : history.length > 0 ? (
              <HistoryChart data={history} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Historical Intensity</CardTitle>
                  <CardDescription>No historical data available yet. Data will appear after ingestion runs.</CardDescription>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center">
                  <div className="text-muted-foreground">Awaiting data ingestion</div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer info */}
        <footer className="mt-12 pt-8 border-t">
          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p>
              Data sourced from the{" "}
              <a
                href="https://carbonintensity.org.uk/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                National Grid ESO Carbon Intensity API
              </a>{" "}
              and{" "}
              <a
                href="https://developer.octopus.energy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Octopus Energy (Agile prices)
              </a>
            </p>
            <p>
              Carbon intensity measured in grams of CO2 equivalent per kilowatt-hour (gCO2/kWh)
            </p>
          </div>

          {/* Developer credit */}
          <div className="mt-6 flex flex-col items-center gap-1.5 border-t pt-6 text-sm">
            <p className="font-medium">Made by Zubair Ahmad</p>
            <a
              href="https://github.com/zubairahmad054"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
            >
              <GithubMark className="h-4 w-4" />
              See my GitHub for more
            </a>
          </div>
        </footer>
      </main>
    </div>
  )
}
