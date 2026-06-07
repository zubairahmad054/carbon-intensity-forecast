"use client"

import useSWR from "swr"
import { IntensityGauge } from "@/components/intensity-gauge"
import { ForecastChart } from "@/components/forecast-chart"
import { HistoryChart } from "@/components/history-chart"
import { BestTimePanel } from "@/components/best-time-panel"
import { ModelMetricsCard } from "@/components/model-metrics-card"
import { GenerationMixPanel } from "@/components/generation-mix-panel"
import { AccuracyCard } from "@/components/accuracy-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, Zap, AlertCircle } from "lucide-react"
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
          {/* Current Intensity - Full width on mobile, 1 col on desktop */}
          <Card className="lg:col-span-1">
            <CardHeader className="text-center">
              <CardTitle>Current Intensity</CardTitle>
              <CardDescription>Live carbon intensity reading</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              {currentLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-pulse text-muted-foreground">Loading...</div>
                </div>
              ) : currentError ? (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <AlertCircle className="h-8 w-8" />
                  <span>Failed to load data</span>
                </div>
              ) : currentIntensity ? (
                <IntensityGauge
                  value={currentIntensity.actual ?? currentIntensity.forecast ?? 0}
                  index={currentIntensity.index ?? "moderate"}
                />
              ) : (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <AlertCircle className="h-8 w-8" />
                  <span>No data available</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Best Time Panel */}
          <div className="lg:col-span-2">
            <BestTimePanel forecasts={forecasts} />
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
              <ForecastChart data={forecasts} />
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
              </a>
            </p>
            <p>
              Carbon intensity measured in grams of CO2 equivalent per kilowatt-hour (gCO2/kWh)
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
