# UK Grid Carbon Intensity Forecasting

[![CI](https://github.com/zubairahmad054/carbon-intensity-forecast/actions/workflows/ci.yml/badge.svg)](https://github.com/zubairahmad054/carbon-intensity-forecast/actions/workflows/ci.yml)
[![Live](https://img.shields.io/badge/demo-live-brightgreen)](https://carbon-intensity-forecasting.vercel.app)

**Live demo → https://carbon-intensity-forecasting.vercel.app**

A self-updating service that forecasts the carbon intensity of the **Great Britain electricity grid 48 hours ahead**, trains its own model against a year of history, and **measures itself live against the official National Energy System Operator (NESO) forecast** — then explains the result on a public dashboard.

The interesting part isn't the model — it's the system around it: automated ingestion, a managed Postgres store, a weather-driven model retrained nightly, and a dashboard that reports its own accuracy honestly (something the official dashboard never does).

---

## Why this isn't just a NESO dashboard clone

The official [Carbon Intensity dashboard](https://carbonintensity.org.uk/) shows the grid's *current* state. This project does what it structurally does **not**:

- **Its own forecast**, trained on weather + history, served and version-tracked.
- **Published accuracy.** Every forecast is stored and later scored against the metered actual — so the dashboard shows realised MAE/RMSE for our model **head-to-head against NESO's own forecast**.
- **Self-explaining metrics.** Tap any metrics card to see what MAE / RMSE / R² / Bias mean for carbon intensity, generated from the live numbers.

And a **flexibility layer** that turns the forecast into a decision ([design doc](./docs/roadmap-flex.md)):

- **Marginal emissions**, not just average — what *one extra kWh* actually emits (the gas plant that responds), the metric that matters for any decision to use or shift power. NESO only shows the average.
- **A "best time to run" scheduler.** Give it a load + duration + deadline and it finds the optimal 48 h window, reporting savings on both an honest grid-average and a marginal (consequential) basis.
- **Carbon × price co-optimisation.** Overlays live Octopus Agile prices so the scheduler optimises for cleanest, cheapest, or the balance between them.

---

## Architecture

```
GitHub Actions (cron)
┌───────────────────────────┐        ┌──────────────────────────────┐
│ Hourly: POST /api/ingest  │        │ Daily: train.py → marginal.py │
│ → latest actuals,         │        │ → backfill, fetch weather      │
│   NESO forecast,          │        │   (Open-Meteo), train model,   │
│   generation mix,         │        │   recursive 48h forecast,      │
│   Agile prices            │        │   marginal (hist + forward)    │
└────────────┬──────────────┘        └───────────────┬───────────────┘
             │ writes                                 │ writes
             ▼                                        ▼
        ┌─────────────────────────────────────────────────┐
        │                Neon Postgres                     │
        │  carbon_intensity · generation_mix · forecasts · │
        │  model_metrics · marginal_intensity · agile_prices│
        └───────────────────────┬─────────────────────────┘
                                 │ reads (dynamic)
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │   Next.js 16 on Vercel (App Router)              │
        │   • Dashboard (gauge, mix, forecast, accuracy,   │
        │     "best time to run" scheduler)                │
        │   • /api/* route handlers serving JSON           │
        └─────────────────────────────────────────────────┘
                                 ▲
                                 │ source data
   UK Carbon Intensity API · Open-Meteo (weather) · Octopus Agile (price)
```

Training and serving are **decoupled**: the model runs only in GitHub Actions (Python), writes to Neon, and the web tier just serves what's there. Local dev and production share one Neon database, so going live needs no data export.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) · TypeScript · Tailwind · shadcn/ui · Recharts |
| API | Next.js route handlers (Node) |
| Database | Neon Postgres (`@neondatabase/serverless`) + versioned SQL migrations |
| Model | Python · scikit-learn `GradientBoostingRegressor` · pandas/numpy |
| Weather | Open-Meteo (free, no key) — wind@100m, solar radiation, temperature |
| Prices | Octopus Energy Agile API (free, no key) — half-hourly unit price |
| Automation | GitHub Actions (hourly ingest, daily retrain + marginal, CI) |
| Hosting | Vercel (auto-deploys on push to `main`) |

## API

Base URL: `https://carbon-intensity-forecasting.vercel.app`

| Endpoint | Description |
|---|---|
| `GET /api/intensity/current` | Latest half-hour: actual, NESO forecast, index, trend |
| `GET /api/intensity/history?period=24h\|48h\|7d` | Historical actual vs NESO forecast |
| `GET /api/forecasts` | Three-channel forward signal: our 48h forecast + marginal + Agile price |
| `GET /api/schedule?power=&duration=&deadline=&objective=` | Best window to run a load (`objective`: `carbon`/`cost`/`balanced`) |
| `GET /api/generation/current` | Live fuel mix (wind/solar/gas/nuclear/…) + % low-carbon |
| `GET /api/accuracy` | Realised MAE/RMSE/Bias per model vs settled actuals |
| `GET /api/metrics` | Trained model's held-out metrics |
| `POST /api/ingest` | Ingest latest data + Agile prices (token-protected via `INGEST_TOKEN`) |

```bash
curl https://carbon-intensity-forecasting.vercel.app/api/forecasts
```

## Local development

**Prerequisites:** Node 20+, pnpm, Python 3.12+.

```bash
# 1. Web app
cp .env.example .env.local          # add your Neon DATABASE_URL
pnpm install
pnpm db:migrate                     # create tables (idempotent)

# 2. Model pipeline (Python)
python -m venv .venv
.venv/Scripts/activate              # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r scripts/requirements.txt
python scripts/backfill.py 365      # one year of history into Neon
python scripts/train.py             # train + write forecast & metrics

# 3. Run
pnpm dev                            # http://localhost:3000
```

Without a `DATABASE_URL`, the app still runs: the routes gracefully fall back to the live Carbon Intensity API (and demo forecasts), so it never crashes. See [`DEPLOY.md`](./DEPLOY.md) for the production runbook and [`db/README.md`](./db/README.md) for the database workflow.

## How the model works

A scikit-learn `GradientBoostingRegressor` trained on ~1 year of half-hourly observations. Features are chosen so they're **knowable for future periods**:

- **Calendar** — cyclical hour-of-day, day-of-week, month + weekend flag
- **Weather forecast** — wind speed (100 m), solar radiation, temperature (Open-Meteo)
- **Lags** — `lag_48` (24 h ago) and `lag_336` (one week ago)

For the 48-hour horizon, `lag_48` falls in the unknown future, so inference is **recursive** — the model's own earlier predictions are fed forward as the lag for later steps (no leakage from the present). Evaluated on a held-out last-14-days split, then refit on all data for the production forecast. Every prediction is stored so it can later be scored against the settled actual.

## Known limitations

- **Single-point weather.** A central-GB coordinate is a proxy; wind dominates intensity and offshore North-Sea farms aren't represented. A wind-capacity-weighted multi-point blend is the biggest remaining accuracy lever.
- **Point forecast only** — no calibrated uncertainty bands yet (quantile/conformal intervals are planned).
- **Stock model** — `GradientBoosting` with sensible defaults, untuned.
- **Realised accuracy is still accumulating** — early sample sizes are small; the live figures stabilise as more forecasts settle.

## What I'd do with more time

- Multi-point, wind-capacity-weighted weather features
- Quantile / conformal prediction intervals
- Score the **marginal** forecast against realised marginal (the accuracy engine already supports it)
- A regression-based marginal model (vs the current merit-order rule) once absolute demand data is wired in

> Marginal emissions and a carbon × price scheduler were on this list and are now **built** — see the [flexibility layer design doc](./docs/roadmap-flex.md).

## Data & licence

- Carbon intensity & generation mix: **NESO / National Grid ESO Carbon Intensity API** (CC BY 4.0)
- Weather: **Open-Meteo** (free tier)
- Electricity prices: **Octopus Energy Agile** API (free, public)
- Code: MIT

---

Made by **Zubair Ahmad** — [github.com/zubairahmad054](https://github.com/zubairahmad054)
