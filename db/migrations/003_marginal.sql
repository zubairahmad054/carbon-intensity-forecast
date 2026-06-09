-- 003_marginal.sql
-- Marginal carbon intensity: what *one extra kWh* of demand actually emits at a
-- given half-hour. This differs from the average intensity NESO publishes, because
-- the extra kWh is met by the marginal (most-expensive dispatched) generator — in
-- GB almost always gas. It's the metric that matters for any decision to use or
-- shift load, and the basis for the scheduler's "kgCO2 saved" figure.
--
-- One row per half-hour. Historical rows (method = 'merit-order') are derived from
-- the real generation mix; forward rows (method = 'forecast-map') are the marginal
-- forecast aligned to our 48h intensity forecast. See scripts/marginal.py.
CREATE TABLE IF NOT EXISTS marginal_intensity (
    timestamp     TIMESTAMPTZ PRIMARY KEY,   -- period start, UTC; matches carbon_intensity.timestamp
    marginal_gco2 NUMERIC(8,2) NOT NULL,      -- gCO2/kWh attributed to the marginal generator
    marginal_fuel TEXT,                       -- the fuel deemed on the margin (null for forecast rows)
    method        TEXT NOT NULL,              -- 'merit-order' (historical) | 'forecast-map' (forward)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marginal_intensity_timestamp
    ON marginal_intensity (timestamp DESC);
