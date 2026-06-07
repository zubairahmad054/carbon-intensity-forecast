"use client"

import { cn } from "@/lib/utils"

interface IntensityGaugeProps {
  value: number
  index: string
  className?: string
}

const indexColors: Record<string, { bg: string; text: string; ring: string }> = {
  "very low": { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-500" },
  low: { bg: "bg-green-100", text: "text-green-700", ring: "ring-green-500" },
  moderate: { bg: "bg-yellow-100", text: "text-yellow-700", ring: "ring-yellow-500" },
  high: { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-500" },
  "very high": { bg: "bg-red-100", text: "text-red-700", ring: "ring-red-500" },
}

export function IntensityGauge({ value, index, className }: IntensityGaugeProps) {
  const normalizedIndex = index.toLowerCase()
  const colors = indexColors[normalizedIndex] ?? indexColors.moderate

  // Calculate rotation for gauge needle (0-400 gCO2/kWh maps to -90 to 90 degrees)
  const maxValue = 400
  const clampedValue = Math.min(Math.max(value, 0), maxValue)
  const rotation = -90 + (clampedValue / maxValue) * 180

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative w-48 h-24 overflow-hidden">
        {/* Gauge background arc */}
        <div className="absolute inset-0 rounded-t-full bg-gradient-to-r from-emerald-400 via-yellow-400 to-red-500 opacity-20" />
        
        {/* Gauge segments */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 100">
          {/* Very Low - Green */}
          <path
            d="M 20 100 A 80 80 0 0 1 56 32"
            fill="none"
            stroke="#10b981"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Low - Light Green */}
          <path
            d="M 56 32 A 80 80 0 0 1 100 20"
            fill="none"
            stroke="#22c55e"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Moderate - Yellow */}
          <path
            d="M 100 20 A 80 80 0 0 1 144 32"
            fill="none"
            stroke="#eab308"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* High - Orange */}
          <path
            d="M 144 32 A 80 80 0 0 1 168 56"
            fill="none"
            stroke="#f97316"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Very High - Red */}
          <path
            d="M 168 56 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#ef4444"
            strokeWidth="12"
            strokeLinecap="round"
          />
          
          {/* Needle */}
          <g transform={`rotate(${rotation}, 100, 100)`}>
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="30"
              stroke="currentColor"
              strokeWidth="3"
              className="text-foreground"
            />
            <circle cx="100" cy="100" r="6" fill="currentColor" className="text-foreground" />
          </g>
        </svg>
      </div>

      {/* Value display */}
      <div className="text-center">
        <div className="text-4xl font-bold tracking-tight">{value}</div>
        <div className="text-sm text-muted-foreground">gCO2/kWh</div>
      </div>

      {/* Index badge */}
      <div
        className={cn(
          "px-4 py-1.5 rounded-full font-medium text-sm capitalize ring-2",
          colors.bg,
          colors.text,
          colors.ring
        )}
      >
        {index}
      </div>
    </div>
  )
}
