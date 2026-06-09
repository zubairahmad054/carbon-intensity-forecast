# Flexibility Layer — Integration Roadmap

> Status: **implemented** (Phases A–C). This document is the design contract that
> the build follows — it explains how the three features lock together rather than
> sitting as three bolt-ons.

## The core idea that makes them one feature, not three

All three features read from **one shared spine: the half-hourly forward signal**,
keyed on `target_time`. Originally the `forecasts` table held one number per future
half-hour (`predicted_intensity`, `model_version = ours-v1`). The flexibility layer
widens that single signal into a **three-channel forward signal** for each future
half-hour `t`:

| Channel | Question it answers | Source |
|---|---|---|
| **Average intensity** (had it) | "How clean is the grid at `t`?" | `ours-v1` forecast |
| **Marginal intensity** (#2) | "What does *one more kWh* at `t` actually emit?" | derived from generation-mix dynamics |
| **Price** (#3) | "What does that kWh *cost* at `t`?" | Octopus Agile API |

Once those three live on the same time grid, **the scheduler (#1) is just a
consumer** that slides a window across the grid and optimises whichever objective
you ask for (cleanest / cheapest / both). That is the "in sync" answer: the features
don't talk to each other directly — they all publish onto the same timeline, and the
scheduler reads it.

```
        +---------- one half-hourly forward signal (the spine) ----------+
  t ->  |  avg gCO2   .   marginal gCO2   .   price p/kWh                 |
        +-------------------------------+--------------------------------+
                                        | reads
                                        v
                    Scheduler: "best time to run"  <- the decision layer
```

---

## Feature #2 — Marginal emissions (the foundation)

**Why first:** the scheduler's headline number is *"shifting this load saves X
kgCO2."* If that's computed on *average* intensity it overstates the benefit, because
the plant that actually responds to your extra kWh is the **marginal** one (usually
gas). Marginal is the metric the savings claim depends on, so it exists before the
scheduler can be honest.

**Estimation (v1, defensible and simple):** a merit-order rule over the generation
mix we already ingest. The marginal generator is the most expensive dispatched plant
online; when demand rises by 1 kWh that plant responds. We identify it per half-hour
and assign it the **official Carbon Intensity API fuel factor** (coal 937, gas 394,
…). The same rule lives in `lib/marginal.ts` (TS, for live values) and
`scripts/marginal.py` (Python, for the stored series) — documented as mirrors.

**Where it lives:**
- **Schema:** `marginal_intensity(timestamp PK, marginal_gco2, marginal_fuel, method)`.
- **Compute:** `scripts/marginal.py` runs in the daily job after training. It writes
  the historical marginal series (from real mix) **and** a forward marginal forecast
  aligned to the `ours-v1` horizon (via an empirical average→marginal map).
- **Serve:** `/api/forecasts` returns `marginal` alongside `predicted_intensity`;
  `/api/intensity/current` computes the *current* marginal on the fly from the latest
  mix (so the gauge is fresh hourly, not a day stale).

**Dashboard:** the Current Intensity card gets an **Average ⇄ Marginal toggle** and a
tap-to-explain panel saying why marginal is higher and why it's the number that
matters for any decision to use or shift power.

---

## Feature #1 — Scheduler "best time to run" (the decision layer)

**What it is:** three inputs — load power (kW), duration, deadline (within 48 h).
Output: the optimal contiguous window plus kgCO2 (and £) saved versus running now.

**How it computes:** a sliding-window minimisation over the forward signal — pure
computation, no new data, no model. The core lives in `lib/schedule.ts` and is used
both client-side (instant interactivity) and by the `GET /api/schedule` route (the
"platform, not just a dashboard" story).

**Savings math:** `kgCO2 saved = power × duration × (marginal_now − marginal_window) / 1000`
— note it uses **marginal** (#2). That dependency is the design made concrete.

**Dashboard:** the hero card. The chosen window is **highlighted directly on the 48 h
forecast chart** (a shaded band), so the recommendation and the data that produced it
are the same picture.

---

## Feature #3 — Carbon × price (the layer on top)

**What it is:** real half-hourly electricity prices so the scheduler can optimise
cleanest, cheapest, or the trade-off between them.

**Data:** Octopus **Agile** API — free, no key, half-hourly unit prices (p/kWh inc.
VAT) per regional tariff.

> ⚠️ **Horizon mismatch (designed for, not hidden).** Agile publishes next-day prices
> around 16:00 daily, so you get ~16–38 h of forward price — shorter than the 48 h
> carbon horizon. The dashboard shows price only where it exists and the scheduler's
> cost objective only ranks windows inside the priced horizon.

**Where it lives:**
- **Schema:** `agile_prices(timestamp PK, region, price_p_kwh)`.
- **Ingest:** an Agile fetch added to the existing hourly ingest job.
- **Serve:** price becomes the third channel on `/api/forecasts`; the scheduler gains
  `objective = carbon | cost | balanced`.

**Dashboard:** the forecast chart gets a price line; the scheduler gets a
Carbon ⇄ Cost ⇄ Balanced selector ("balanced" = cleanest-for-the-price).

---

## How it all stays in sync (the contract)

1. **One time grid.** Every channel is half-hourly on `target_time`.
2. **The spine is `/api/forecasts`.** It joins forecast + marginal + price per
   half-hour, so every card reads the same object and they can't disagree.
3. **The scheduler never re-fetches or re-models** — it only minimises over what's on
   the spine. Add a channel → the scheduler can optimise it for free.
4. **Accuracy can extend to all channels** — the stored historical marginal means the
   marginal forecast can later be scored the same honest way the intensity forecast is.

---

## Build order & what touches the repo

| Phase | Feature | New schema | Job touched | Routes | UI |
|---|---|---|---|---|---|
| **A** | Marginal (#2) | `marginal_intensity` | daily train (+`marginal.py`) | `/api/forecasts`, `/api/intensity/current` | gauge toggle + explain |
| **B** | Scheduler (#1) | — | — | `/api/schedule` | hero scheduler card + chart highlight |
| **C** | Price (#3) | `agile_prices` | hourly ingest | `/api/forecasts`, `/api/schedule` | price line + objective selector |

Each phase is independently deployable and degrades gracefully — if a channel is
missing (no price yet, marginal not computed), the dashboard still renders and the
scheduler falls back to the carbon objective. Storage impact on the 0.5 GB Neon free
tier is negligible (both new tables are tiny).
