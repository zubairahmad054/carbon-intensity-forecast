"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Leaf, Zap, Clock, PoundSterling, Scale } from "lucide-react"
import { format } from "date-fns"
import type { ForecastPoint } from "@/lib/types"
import {
  rankWindows,
  windowSavings,
  type SignalPoint,
  type ScheduleObjective,
} from "@/lib/schedule"
import { getIntensityIndex, getIntensityColor } from "@/lib/types"

interface SchedulerCardProps {
  forecasts: ForecastPoint[]
  onWindowChange?: (window: { start: string; end: string } | null) => void
  className?: string
}

const PRESETS = [
  { label: "EV charge", power: 7 },
  { label: "Washing", power: 2 },
  { label: "Dishwasher", power: 1.5 },
  { label: "Heat-pump", power: 3 },
]

const DURATIONS = [1, 2, 3, 4]
const DEADLINES = [
  { label: "12 h", hours: 12 },
  { label: "24 h", hours: 24 },
  { label: "48 h", hours: 48 },
]

const OBJECTIVES: { key: ScheduleObjective; label: string; icon: typeof Leaf }[] = [
  { key: "carbon", label: "Cleanest", icon: Leaf },
  { key: "cost", label: "Cheapest", icon: PoundSterling },
  { key: "balanced", label: "Balanced", icon: Scale },
]

export function SchedulerCard({ forecasts, onWindowChange, className }: SchedulerCardProps) {
  const [power, setPower] = useState(7)
  const [durationH, setDurationH] = useState(3)
  const [withinHours, setWithinHours] = useState(24)
  const [objective, setObjective] = useState<ScheduleObjective>("carbon")

  const signal: SignalPoint[] = useMemo(
    () =>
      forecasts.map((f) => ({
        target_time: f.target_time,
        intensity: f.predicted_intensity,
        marginal: f.marginal,
        price: f.price,
      })),
    [forecasts],
  )

  const priced = signal.some((p) => p.price != null)

  const { best, savings, alternatives } = useMemo(() => {
    const durationHalfHours = Math.round(durationH * 2)
    const deadline = new Date(Date.now() + withinHours * 3_600_000).toISOString()
    const ranked = rankWindows(signal, { durationHalfHours, deadline, objective })
    const baseline = rankWindows(signal, { durationHalfHours, objective: "carbon" }).find(
      (w) => w.start === signal[0]?.target_time,
    )
    const top = ranked[0]
    return {
      best: top,
      savings: top && baseline ? windowSavings(power, top, baseline) : null,
      alternatives: ranked.slice(1, 3),
    }
  }, [signal, power, durationH, withinHours, objective])

  // Lift the chosen window so the forecast chart can highlight it.
  useEffect(() => {
    onWindowChange?.(best ? { start: best.start, end: best.end } : null)
  }, [best?.start, best?.end, onWindowChange])

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Leaf className="h-5 w-5 text-primary" />
          When should I run it?
        </CardTitle>
        <CardDescription>
          Pick the best window in the next {withinHours}h to run a flexible load — optimised for
          carbon, cost, or both.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Objective tabs */}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {OBJECTIVES.map((o) => {
            const disabled = o.key !== "carbon" && !priced
            const active = objective === o.key
            return (
              <button
                key={o.key}
                type="button"
                disabled={disabled}
                onClick={() => setObjective(o.key)}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                title={disabled ? "Needs price data (Octopus Agile)" : undefined}
              >
                <o.icon className="h-4 w-4" />
                {o.label}
              </button>
            )
          })}
        </div>

        {/* Inputs */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Load (kW)</span>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPower(p.power)}
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    power === p.power
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={power}
              onChange={(e) => setPower(Math.max(0.1, Number(e.target.value) || 0))}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Duration</span>
            <div className="flex gap-1">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationH(d)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-sm transition-colors ${
                    durationH === d
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d}h
                </button>
              ))}
            </div>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Finish within</span>
            <div className="flex gap-1">
              {DEADLINES.map((d) => (
                <button
                  key={d.hours}
                  type="button"
                  onClick={() => setWithinHours(d.hours)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-sm transition-colors ${
                    withinHours === d.hours
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </label>
        </div>

        {/* Result */}
        {best ? (
          <Result
            start={best.start}
            end={best.end}
            avgIntensity={best.avgIntensity}
            avgPrice={best.avgPrice}
            savings={savings}
            hasMarginal={best.avgMarginal != null}
          />
        ) : (
          <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            No window fits those settings yet — try a shorter duration or a longer deadline. (The
            forecast appears once the model has run.)
          </p>
        )}

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Other good windows</div>
            {alternatives.map((w) => (
              <div
                key={w.start}
                className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5 text-sm"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {format(new Date(w.start), "EEE HH:mm")} – {format(new Date(w.end), "HH:mm")}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(w.avgIntensity)} g{w.avgPrice != null ? ` · ${w.avgPrice.toFixed(1)}p` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          Two honest bases: <strong>grid-average</strong> is how a carbon footprint is usually
          counted; <strong>marginal</strong> is what your extra demand actually <em>causes</em> —
          often near zero because gas sets the margin at both times. The gap is the nuance an
          average-only view hides.
        </p>
      </CardContent>
    </Card>
  )
}

function Result({
  start,
  end,
  avgIntensity,
  avgPrice,
  savings,
  hasMarginal,
}: {
  start: string
  end: string
  avgIntensity: number
  avgPrice: number | null
  savings: { co2KgAverage: number; co2KgMarginal: number | null; costGbp: number | null } | null
  hasMarginal: boolean
}) {
  const index = getIntensityIndex(avgIntensity)
  const color = getIntensityColor(index)
  const avg = savings?.co2KgAverage ?? 0
  const marg = savings?.co2KgMarginal ?? null
  const cost = savings?.costGbp ?? null
  const showSavings = avg > 0.001 || (cost != null && Math.abs(cost) > 0.001)

  return (
    <div className="rounded-lg bg-primary/10 p-4 ring-1 ring-primary/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <Zap className="h-3.5 w-3.5" />
            Best window
          </div>
          <div className="mt-1 text-lg font-bold">
            {format(new Date(start), "EEE d MMM, HH:mm")} – {format(new Date(end), "HH:mm")}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              {Math.round(avgIntensity)} gCO₂/kWh avg
            </span>
            {avgPrice != null && <span>· {avgPrice.toFixed(1)} p/kWh avg</span>}
          </div>
        </div>
      </div>

      {showSavings && (
        <div className="mt-3 grid gap-1.5 border-t border-primary/15 pt-3 text-sm">
          {avg > 0.001 && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">vs running now (grid-average)</span>
              <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                −{avg.toFixed(2)} kg CO₂
              </span>
            </div>
          )}
          {hasMarginal && marg != null && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">vs running now (marginal / caused)</span>
              <span className="font-semibold tabular-nums">
                {marg > 0.001 ? `−${marg.toFixed(2)} kg CO₂` : "≈ 0 (gas on margin)"}
              </span>
            </div>
          )}
          {cost != null && Math.abs(cost) > 0.001 && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">vs running now (cost)</span>
              <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                {cost > 0 ? `−£${cost.toFixed(2)}` : `+£${(-cost).toFixed(2)}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
