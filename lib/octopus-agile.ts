/**
 * Client for the Octopus Energy **Agile** tariff — free, public, no API key.
 * Agile is a half-hourly time-of-use price that tracks the wholesale market, so it
 * pairs naturally with the carbon forecast: the scheduler can then optimise for
 * cleanest, cheapest, or the trade-off between them.
 *
 * Docs: https://developer.octopus.energy/rest/reference/products
 *
 * Prices are per regional distribution area (a single DNO letter). A GB-grid-wide
 * dashboard uses one region as a representative proxy (default 'C' = London).
 * Next-day prices publish ~16:00, so the forward horizon here (~16-38h) is shorter
 * than the 48h carbon horizon — callers handle the gap gracefully.
 */

const PRODUCT = process.env.AGILE_PRODUCT || "AGILE-24-04-03"
const REGION = (process.env.AGILE_REGION || "C").toUpperCase()
const BASE = "https://api.octopus.energy/v1"

export interface AgilePrice {
  periodStart: string // ISO 8601, UTC — start of the half hour
  periodEnd: string
  priceIncVat: number // pence per kWh, inc. VAT (can be negative when the grid is oversupplied)
}

interface RawRate {
  value_exc_vat: number
  value_inc_vat: number
  valid_from: string
  valid_to: string
}

export const AGILE_REGION = REGION

function toIso(d: Date): string {
  return d.toISOString()
}

/**
 * Agile unit rates from `hoursBack` ago to `hoursForward` ahead, chronological.
 * Returns [] if the product/region can't be resolved (kept non-fatal for ingest).
 */
export async function fetchAgilePrices(hoursBack = 24, hoursForward = 48): Promise<AgilePrice[]> {
  const now = Date.now()
  const from = new Date(now - hoursBack * 3_600_000)
  const to = new Date(now + hoursForward * 3_600_000)
  const tariff = `E-1R-${PRODUCT}-${REGION}`
  const url =
    `${BASE}/products/${PRODUCT}/electricity-tariffs/${tariff}/standard-unit-rates/` +
    `?period_from=${encodeURIComponent(toIso(from))}&period_to=${encodeURIComponent(toIso(to))}`

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 900 },
  })
  if (!res.ok) {
    throw new Error(`Octopus Agile API error: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as { results?: RawRate[] }
  return (json.results ?? [])
    .map((r) => ({
      periodStart: new Date(r.valid_from).toISOString(),
      periodEnd: new Date(r.valid_to).toISOString(),
      priceIncVat: r.value_inc_vat,
    }))
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
}
