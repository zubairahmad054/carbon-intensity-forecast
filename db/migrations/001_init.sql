-- 001_init.sql
-- Baseline schema for the carbon-intensity forecasting service.
-- Matches the columns the API routes read/write today. New features (generation
-- mix, regional intensity, prediction intervals) should arrive as later
-- migration files (002_*.sql, ...) so production can be upgraded in place — no
-- data export/import is ever required to go live.

-- Half-hourly observations of GB grid carbon intensity.
CREATE TABLE IF NOT EXISTS carbon_intensity (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp   TIMESTAMPTZ NOT NULL UNIQUE,   -- period start, UTC; UNIQUE backs ON CONFLICT in ingest
    actual      INTEGER,                        -- metered carbon intensity, gCO2/kWh
    forecast    INTEGER,                        -- NESO's own forecast (nullable; not populated by current source)
    index       TEXT,                           -- 'very low' | 'low' | 'moderate' | 'high' | 'very high'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carbon_intensity_timestamp
    ON carbon_intensity (timestamp DESC);

-- Forecasts produced by our model, stored for serving and later accuracy backtesting.
CREATE TABLE IF NOT EXISTS forecasts (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    target_time         TIMESTAMPTZ NOT NULL,   -- the half-hour this prediction is FOR
    predicted_intensity INTEGER NOT NULL,        -- gCO2/kWh
    model_version       TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (target_time, model_version)          -- one prediction per period per model
);

CREATE INDEX IF NOT EXISTS idx_forecasts_target_time
    ON forecasts (target_time);

-- Trained model metadata + held-out evaluation metrics.
CREATE TABLE IF NOT EXISTS model_metrics (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_version    TEXT NOT NULL UNIQUE,
    trained_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    mae              NUMERIC(8,2),               -- mean absolute error, gCO2/kWh
    rmse             NUMERIC(8,2),
    r2_score         NUMERIC(6,4),
    training_samples INTEGER
);

CREATE INDEX IF NOT EXISTS idx_model_metrics_trained_at
    ON model_metrics (trained_at DESC);
