-- 004_agile_prices.sql
-- Half-hourly electricity unit price (Octopus Agile, p/kWh inc. VAT). Pairing the
-- carbon forecast with a real time-varying tariff lets the scheduler optimise for
-- cleanest, cheapest, or the trade-off between them — the dimension NESO has none of.
--
-- One region per deployment (set via AGILE_REGION; default 'C' = London). Agile
-- publishes next-day prices ~16:00, so this table holds a shorter forward horizon
-- (~16-38h) than the 48h carbon forecast — handled gracefully downstream.
CREATE TABLE IF NOT EXISTS agile_prices (
    timestamp   TIMESTAMPTZ PRIMARY KEY,   -- period start, UTC; matches forecasts.target_time
    region      TEXT NOT NULL,             -- Octopus DNO region letter (e.g. 'C')
    price_p_kwh NUMERIC(8,3) NOT NULL,      -- unit price, pence per kWh, inc. VAT (can be negative)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agile_prices_timestamp
    ON agile_prices (timestamp DESC);
