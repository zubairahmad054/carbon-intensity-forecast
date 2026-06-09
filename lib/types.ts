// Carbon intensity reading from database
export interface CarbonIntensity {
  id: number
  timestamp: string
  actual: number
  forecast: number | null
  index: string | null
  created_at: string
}

// ML model forecast
export interface Forecast {
  id: number
  target_time: string
  predicted_intensity: number
  model_version: string
  created_at: string
}

// Model training metrics
export interface ModelMetrics {
  id: number
  model_version: string
  trained_at: string
  mae: number | null
  rmse: number | null
  r2_score: number | null
  training_samples: number | null
}

// API response types
export interface CurrentIntensityResponse {
  data: {
    timestamp: string
    actual: number | null
    forecast: number | null
    marginal: number | null // marginal gCO2/kWh — what one extra kWh emits right now
    index: IntensityIndex
    trend: "rising" | "falling" | "stable"
  } | null
  error?: string
}

export interface HistoryResponse {
  data: IntensityRecord[]
  period: string
}

export interface IntensityRecord {
  timestamp: string
  actual: number | null
  forecast: number | null
  index: string | null
}

// Generation mix (% share per fuel for a half hour)
export interface GenerationMixPoint {
  timestamp: string
  gas: number
  coal: number
  nuclear: number
  wind: number
  solar: number
  hydro: number
  biomass: number
  imports: number
  other: number
}

export interface GenerationMixResponse {
  data: GenerationMixPoint | null
  error?: string
}

// Realized forecast accuracy (predictions vs settled actuals)
export interface AccuracyStat {
  label: string
  n: number
  mae: number | null // mean absolute error, gCO2/kWh
  rmse: number | null
  bias: number | null // mean signed error; >0 means forecast runs high
}

export interface AccuracyResponse {
  nowcast: AccuracyStat | null // NESO's in-row forecast vs actual
  models: AccuracyStat[] // per model_version: forecast vs actual
  windowDays: number
  error?: string
}

export interface ForecastResponse {
  data: ForecastPoint[]
  model_version: string | null
  generated_at: string | null
}

export interface ForecastPoint {
  target_time: string
  predicted_intensity: number
  marginal: number | null // forecast marginal gCO2/kWh (null until computed)
  price: number | null // forecast unit price p/kWh inc. VAT (null outside priced horizon)
}

export interface ModelMetricsResponse {
  data: ModelMetrics | null
}

export interface BestTimeSlot {
  start: string
  end: string
  average_intensity: number
  index: IntensityIndex
}

// Intensity index thresholds (gCO2/kWh)
export type IntensityIndex = "very low" | "low" | "moderate" | "high" | "very high"

export const INTENSITY_THRESHOLDS = {
  VERY_LOW: 50,
  LOW: 100,
  MODERATE: 200,
  HIGH: 300,
} as const

export function getIntensityIndex(intensity: number): IntensityIndex {
  if (intensity <= INTENSITY_THRESHOLDS.VERY_LOW) return "very low"
  if (intensity <= INTENSITY_THRESHOLDS.LOW) return "low"
  if (intensity <= INTENSITY_THRESHOLDS.MODERATE) return "moderate"
  if (intensity <= INTENSITY_THRESHOLDS.HIGH) return "high"
  return "very high"
}

export function getIntensityColor(index: IntensityIndex): string {
  switch (index) {
    case "very low":
      return "#22c55e" // green-500
    case "low":
      return "#84cc16" // lime-500
    case "moderate":
      return "#eab308" // yellow-500
    case "high":
      return "#f97316" // orange-500
    case "very high":
      return "#ef4444" // red-500
  }
}
