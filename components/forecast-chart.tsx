"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ForecastPoint } from "@/lib/types"
import { format } from "date-fns"

interface ForecastChartProps {
  data: ForecastPoint[]
  className?: string
}

const chartConfig = {
  predicted: {
    label: "Predicted",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function ForecastChart({ data, className }: ForecastChartProps) {
  const chartData = data.map((point) => ({
    time: format(new Date(point.target_time), "HH:mm"),
    fullTime: format(new Date(point.target_time), "EEE, MMM d HH:mm"),
    predicted: point.predicted_intensity,
  }))

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>48-Hour Forecast</CardTitle>
        <CardDescription>
          Predicted carbon intensity for the next 48 hours
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart data={chartData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${value}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload
                    return item?.fullTime ?? ""
                  }}
                  formatter={(value) => [`${value} gCO2/kWh`, "Predicted"]}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="predicted"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#forecastGradient)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
