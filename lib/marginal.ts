/**
 * Marginal carbon intensity from the generation mix.
 *
 * Average intensity (what NESO publishes) answers "how clean is the grid right now?".
 * MARGINAL intensity answers "what does one MORE kWh of demand emit?" — which is the
 * question that actually matters when you decide to use or shift load. The extra kWh
 * is met by the marginal (most-expensive dispatched) generator, so the marginal
 * intensity is that generator's emissions factor.
 *
 * v1 rule: a merit order. We walk the fuels from most- to least-expensive-to-run and
 * take the first one with a meaningful share as "on the margin". Factors are the
 * official Carbon Intensity API values (gCO2/kWh).
 *
 * NOTE: keep this in sync with scripts/marginal.py (same factors + merit order).
 */
import type { GenerationMixPoint } from "./types"

/** Official Carbon Intensity API fuel carbon factors, gCO2/kWh. */
export const FUEL_CARBON_FACTORS = {
  gas: 394, // CCGT
  coal: 937,
  biomass: 120,
  imports: 200, // blended interconnectors (FR ~53, NL ~474, IE ~458) — representative
  other: 300,
  nuclear: 0,
  wind: 0,
  solar: 0,
  hydro: 0,
} as const

// Most-expensive-to-run first: the marginal plant is the last one dispatched, i.e.
// the dirtiest/most-expensive flexible fuel currently running above the threshold.
const MERIT_ORDER: (keyof GenerationMixPoint & keyof typeof FUEL_CARBON_FACTORS)[] = [
  "coal",
  "gas",
  "other",
  "imports",
  "biomass",
]

const SHARE_THRESHOLD = 1.0 // % — ignore trace amounts of a fuel

export interface MarginalEstimate {
  /** gCO2/kWh attributed to the marginal generator. */
  gco2: number
  /** Which fuel was deemed on the margin (null when the grid is effectively all low-carbon). */
  fuel: keyof typeof FUEL_CARBON_FACTORS | null
}

/**
 * Estimate the marginal intensity for a half-hour from its fuel mix (% shares).
 * When only zero-carbon plant (wind/solar/nuclear/hydro) is running, the marginal
 * unit is renewable and would be curtailed — marginal ≈ 0.
 */
export function marginalFromMix(mix: GenerationMixPoint): MarginalEstimate {
  for (const fuel of MERIT_ORDER) {
    if ((mix[fuel] ?? 0) >= SHARE_THRESHOLD) {
      return { gco2: FUEL_CARBON_FACTORS[fuel], fuel }
    }
  }
  return { gco2: 0, fuel: null }
}
