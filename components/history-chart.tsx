"use client"

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { IntensityRecord } from "@/lib/types"
import { format } from "date-fns"

interface HistoryChartProps {
  data: IntensityRecord[]
  className?: string
}

const chartConfig = {
  actual: {
    label: "Actual",
    color: "var(--chart-1)",
  },
  forecast: {
    label: "NESO Forecast",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function HistoryChart({ data, className }: HistoryChartProps) {
  const chartData = data.map((record) => ({
    time: format(new Date(record.timestamp), "HH:mm"),
    fullTime: format(new Date(record.timestamp), "EEE, MMM d HH:mm"),
    actual: record.actual,
    forecast: record.forecast,
  }))

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Historical Intensity</CardTitle>
        <CardDescription>
          Actual vs NESO forecast carbon intensity over the last 24 hours
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <LineChart data={chartData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
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
                />
              }
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="var(--chart-2)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
