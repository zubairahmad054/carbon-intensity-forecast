import type { IntensityIndex } from "./types"

/**
 * Client for the official UK Carbon Intensity API (NESO + University of Oxford).
 * Docs: https://carbon-intensity.github.io/api-definitions/
 *
 * Unlike the bare CKAN datastore, this endpoint returns BOTH the metered `actual`
 * and NESO's own `forecast` (plus the index) in a single call, and exposes a real
 * 48-hour forward forecast — which is what we serve instead of synthetic data.
 */
const BASE = process.env.NESO_API_BASE || "https://api.carbonintensity.org.uk"

/** A single half-hourly intensity period. */
export interface IntensityRecord {
  periodStart: string // ISO 8601, UTC — the start of the half hour
  periodEnd: string
  actual: number | null // metered gCO2/kWh (null until settled)
  forecast: number | null // NESO's forecast gCO2/kWh
  index: IntensityIndex | null
}

interface RawPeriod {
  from: string
  to: string
  intensity: { forecast: number | null; actual: number | null; index: IntensityIndex | null }
}

function parse(item: RawPeriod): IntensityRecord {
  return {
    periodStart: item.from,
    periodEnd: item.to,
    actual: item.intensity?.actual ?? null,
    forecast: item.intensity?.forecast ?? null,
    index: item.intensity?.index ?? null,
  }
}

/** Format a Date as the API's expected `YYYY-MM-DDTHH:MMZ`. */
function toApiTime(d: Date): string {
  return `${d.toISOString().slice(0, 16)}Z`
}

async function getJson<T>(path: string, revalidate = 300): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate },
  })
  if (!res.ok) {
    throw new Error(`Carbon Intensity API error: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

async function getData(path: string, revalidate = 300): Promise<RawPeriod[]> {
  const json = await getJson<{ data: RawPeriod[] }>(path, revalidate)
  return json.data ?? []
}

/** The current half-hour's intensity (actual + forecast + index). */
export async function fetchLatestIntensity(): Promise<IntensityRecord | null> {
  const data = await getData("/intensity")
  return data[0] ? parse(data[0]) : null
}

/** Past `hours` of half-hourly intensity, chronological order. */
export async function fetchIntensityHistory(hours = 24): Promise<IntensityRecord[]> {
  const to = new Date()
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)
  const data = await getData(`/intensity/${toApiTime(from)}/${toApiTime(to)}`)
  return data.map(parse)
}

/** NESO's official 48-hour forward forecast from now. */
export async function fetchForecast48h(): Promise<IntensityRecord[]> {
  const data = await getData(`/intensity/${toApiTime(new Date())}/fw48h`, 900)
  return data.map(parse)
}

// ---------------------------------------------------------------------------
// Generation mix — the per-fuel % share of generation (the driver of intensity).
// ---------------------------------------------------------------------------

export const GENERATION_FUELS = [
  "gas",
  "coal",
  "nuclear",
  "wind",
  "solar",
  "hydro",
  "biomass",
  "imports",
  "other",
] as const

export type Fuel = (typeof GENERATION_FUELS)[number]

export interface GenerationMix {
  periodStart: string
  periodEnd: string
  mix: Record<Fuel, number>
}

interface RawGeneration {
  from: string
  to: string
  generationmix: { fuel: string; perc: number }[]
}

function parseGeneration(item: RawGeneration): GenerationMix {
  const mix = Object.fromEntries(GENERATION_FUELS.map((f) => [f, 0])) as Record<Fuel, number>
  for (const g of item.generationmix ?? []) {
    if ((GENERATION_FUELS as readonly string[]).includes(g.fuel)) {
      mix[g.fuel as Fuel] = g.perc
    }
  }
  return { periodStart: item.from, periodEnd: item.to, mix }
}

/** The current half-hour's generation mix. */
export async function fetchCurrentGeneration(): Promise<GenerationMix | null> {
  const json = await getJson<{ data: RawGeneration }>("/generation")
  return json.data ? parseGeneration(json.data) : null
}

/** Past `hours` of half-hourly generation mix, chronological order. */
export async function fetchGenerationHistory(hours = 24): Promise<GenerationMix[]> {
  const to = new Date()
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)
  const json = await getJson<{ data: RawGeneration[] }>(
    `/generation/${toApiTime(from)}/${toApiTime(to)}`
  )
  return (json.data ?? []).map(parseGeneration)
}
