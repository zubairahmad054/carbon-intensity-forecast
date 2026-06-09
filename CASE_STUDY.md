# Case Study — UK Grid Carbon Intensity Forecasting

**Live:** https://carbon-intensity-forecasting.vercel.app · **Code:** https://github.com/zubairahmad054/carbon-intensity-forecast

A self-updating production service that forecasts the carbon intensity of the Great
Britain electricity grid 48 hours ahead, **transparently benchmarks its own model
against the national grid operator's forecast in public**, and turns the forecast
into a decision — the cleanest and cheapest time to use power.

---

## The problem

The UK's official [Carbon Intensity dashboard](https://carbonintensity.org.uk/) is
excellent at one thing: showing the grid's *current* carbon intensity. But it stops
there. It doesn't publish how accurate its forward forecast turns out to be, it
doesn't tell you what an extra unit of demand actually *causes*, and it doesn't help
you decide when to act.

I wanted to build the layer on top: a service that forecasts ahead, **holds itself
accountable by scoring every prediction against what actually happened**, and
converts all of that into an action a person or a device can take.

## What makes it more than a dashboard clone

- **Its own forecast** — a weather-driven ML model, retrained nightly, served and
  version-tracked.
- **Published accuracy** — every forecast is stored and later scored against the
  metered actual, so the dashboard shows realised error for my model **head-to-head
  with NESO's own forecast**, including when mine is behind. The official tool never
  shows this.
- **Marginal emissions, not just average** — what *one extra kWh* actually emits (the
  gas plant that responds), the metric that matters for a load-shifting decision.
- **A "best time to run" scheduler** — give it a load, duration and deadline; it finds
  the optimal 48 h window and reports savings on both a grid-average and a marginal
  basis.
- **Carbon × price co-optimisation** — overlays live Octopus Agile prices so the
  scheduler can optimise for cleanest, cheapest, or the balance between them.

## Architecture

```
GitHub Actions (cron)                    GitHub Actions (cron)
  Hourly: POST /api/ingest                 Daily: train.py -> marginal.py
  actuals · NESO forecast ·                backfill · weather (Open-Meteo) ·
  generation mix · Agile prices            train · recursive 48h forecast · marginal
                 \                          /
                  v                        v
            ┌──────────────────────────────────────┐
            │            Neon Postgres              │
            │  carbon_intensity · generation_mix ·  │
            │  forecasts · model_metrics ·          │
            │  marginal_intensity · agile_prices    │
            └──────────────────┬───────────────────┘
                               │ reads (dynamic)
                               v
            ┌──────────────────────────────────────┐
            │     Next.js 16 on Vercel              │
            │  dashboard + /api/* JSON + scheduler  │
            └──────────────────────────────────────┘
```

Two design decisions I'm proud of:

- **Training and serving are decoupled.** The model runs only in GitHub Actions
  (Python, batch), writes to Postgres, and the web tier just serves what's there.
  The serverless web layer never runs the model — it stays fast and simple.
- **One database for local and production.** Dev and prod share a single Neon
  Postgres, with idempotent versioned SQL migrations, so going live never required a
  data export/import — the production site came up already populated.

## Technical depth

**ML / data**
- Recursive multi-step forecasting: for targets beyond 24 h the lag feature falls in
  the unknown future, so inference feeds the model's own earlier predictions forward —
  **no leakage from the present**.
- Time-aware holdout backtesting (last 14 days), then refit on all data for the
  production forecast.
- Features chosen to be knowable ahead: cyclical calendar terms, weather forecast
  (wind @100 m, solar radiation, temperature), and 24 h / 1 week lags.
- A **merit-order marginal-emissions model** using the official Carbon Intensity fuel
  factors, plus an empirical average→marginal map for the forward horizon.

**Backend / data engineering**
- Typed API routes; batched upserts; idempotent migrations tracked in a `_migrations`
  table.
- **Graceful degradation** — when the database is unavailable the routes fall through
  to the live upstream API instead of erroring, so the dashboard never hard-crashes.

**Automation / DevOps**
- GitHub Actions cron for hourly ingestion and nightly retraining; CI type-checks
  every push; push-to-`main` auto-deploys to Vercel. **£0 running cost.**

**Product**
- The scheduler reports savings on *two* honest bases — attributional (grid-average)
  and consequential (marginal). The marginal figure is often near zero because gas
  sets the margin at both times; surfacing that gap is the nuance an average-only view
  hides, and it shows I think about what a number *means*, not just the number.

## Results (live, and honest)

Held-out model evaluation (≈17.3k half-hourly training samples):

| Metric | ours-v1 (held-out) |
|---|---|
| MAE | ~28 gCO₂/kWh |
| RMSE | ~35 gCO₂/kWh |
| R² | ~0.36 |

Realised accuracy at the 48 h horizon, scored against settled actuals (rolling 7-day
window), my model vs the official forecast:

| Forecast (48 h ahead) | MAE | RMSE | Bias |
|---|---|---|---|
| NESO (official) | ~16 | ~21 | ~−5 |
| **ours-v1 (mine)** | ~20 | ~26 | ~−11 |

**My model currently trails NESO's day-ahead forecast** — which is unsurprising: NESO
has vastly more data, real demand signals, and per-plant detail than a single-point
weather feature. The point of the project was never to claim I beat the national grid
operator; it's that I built the **infrastructure to measure the gap honestly and in
public**. The realised bias (≈ −11, i.e. the model runs low) is a clear, correctable
systematic error and the obvious next lever.

## What I'd do next

- **Bias-correct and add multi-point, wind-capacity-weighted weather** — the single
  central-GB coordinate is the biggest accuracy limitation; offshore North-Sea wind
  dominates intensity and isn't represented. Closing the ≈4 gCO₂/kWh gap to NESO is a
  realistic, well-defined target.
- Calibrated uncertainty bands (quantile / conformal) instead of a point forecast.
- Score the marginal forecast against realised marginal (the accuracy engine already
  supports it).

## Stack

Next.js 16 · TypeScript · Tailwind · Recharts · Neon Postgres · Python · scikit-learn ·
Open-Meteo · Octopus Agile · GitHub Actions · Vercel.

---

Built by **Zubair Ahmad** — [github.com/zubairahmad054](https://github.com/zubairahmad054)
