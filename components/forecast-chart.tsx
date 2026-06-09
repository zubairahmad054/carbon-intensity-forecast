"use client"

import {
  Area,
  Line,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceArea,
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ForecastPoint } from "@/lib/types"
import { format } from "date-fns"

interface ForecastChartProps {
  data: ForecastPoint[]
  /** Optional window to shade (from the scheduler), ISO start/end. */
  highlight?: { start: string; end: string } | null
  className?: string
}

const chartConfig = {
  predicted: { label: "Avg intensity", color: "var(--chart-1)" },
  marginal: { label: "Marginal", color: "var(--chart-4)" },
  price: { label: "Price (p/kWh)", color: "var(--chart-2)" },
} satisfies ChartConfig

export function ForecastChart({ data, highlight, className }: ForecastChartProps) {
  const chartData = data.map((point) => ({
    t: new Date(point.target_time).getTime(),
    fullTime: format(new Date(point.target_time), "EEE, MMM d HH:mm"),
    predicted: point.predicted_intensity,
    marginal: point.marginal,
    price: point.price,
  }))

  const hasMarginal = data.some((p) => p.marginal != null)
  const hasPrice = data.some((p) => p.price != null)
  const h1 = highlight ? new Date(highlight.start).getTime() : null
  const h2 = highlight ? new Date(highlight.end).getTime() : null

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>48-Hour Forecast</CardTitle>
        <CardDescription>
          Predicted average{hasMarginal ? " & marginal" : ""} carbon intensity
          {hasPrice ? " with Agile price" : ""} — the shaded band is the scheduler's pick
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <ComposedChart data={chartData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) => format(new Date(v), "HH:mm")}
              interval="preserveStartEnd"
              minTickGap={48}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${value}`}
            />
            {hasPrice && (
              <YAxis
                yAxisId="price"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => `${v}p`}
              />
            )}
            {h1 != null && h2 != null && (
              <ReferenceArea
                yAxisId="left"
                x1={h1}
                x2={h2}
                fill="var(--chart-1)"
                fillOpacity={0.12}
                stroke="var(--chart-1)"
                strokeOpacity={0.3}
              />
            )}
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload
                    return item?.fullTime ?? ""
                  }}
                />
              }
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="predicted"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#forecastGradient)"
            />
            {hasMarginal && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="marginal"
                stroke="var(--chart-4)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
              />
            )}
            {hasPrice && (
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke="var(--chart-2)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
