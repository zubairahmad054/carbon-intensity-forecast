-- 002_generation_mix.sql
-- Half-hourly generation mix: the % share of each fuel powering the GB grid.
-- This is the *cause* of carbon intensity (wind/solar/nuclear push it down, gas
-- pushes it up) and becomes model features in a later phase. Wide table — one
-- column per fuel — keeps dashboard queries trivial. Values are 0–100 (%).
CREATE TABLE IF NOT EXISTS generation_mix (
    timestamp   TIMESTAMPTZ PRIMARY KEY,   -- period start, UTC; matches carbon_intensity.timestamp
    gas         NUMERIC(5,2),
    coal        NUMERIC(5,2),
    nuclear     NUMERIC(5,2),
    wind        NUMERIC(5,2),
    solar       NUMERIC(5,2),
    hydro       NUMERIC(5,2),
    biomass     NUMERIC(5,2),
    imports     NUMERIC(5,2),
    other       NUMERIC(5,2),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_mix_timestamp
    ON generation_mix (timestamp DESC);
