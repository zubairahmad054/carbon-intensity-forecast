# Contributing

Thanks for your interest! This is a live, self-updating service — contributions
are welcome, from typo fixes to model improvements.

## Quick start

Prerequisites: Node 20+, pnpm, Python 3.12+.

```bash
# Web app
cp .env.example .env.local     # add a Neon Postgres DATABASE_URL (free tier works)
pnpm install
pnpm db:migrate                # idempotent — creates/updates tables

# Python pipeline
python -m venv .venv
.venv/Scripts/activate         # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r scripts/requirements.txt
python scripts/backfill.py 30  # some history to play with
python scripts/train.py        # train + write a forecast
python scripts/marginal.py     # derive the marginal series

pnpm dev                       # http://localhost:3000
```

No database? The app still runs — routes fall back to the live Carbon Intensity
API and demo forecasts.

## Workflow

`main` is protected: changes land via pull request with CI green.

1. Fork (or branch, if you have access) and create a topic branch.
2. Make your change. Match the style around you; comments explain *why*, not *what*.
3. Check it passes what CI runs:
   - `pnpm exec tsc --noEmit`
   - `python -m py_compile scripts/*.py`
4. Open a PR with a clear description of the problem and the approach.

## Architecture ground rules

A few invariants that PRs should preserve (see [docs/roadmap-flex.md](docs/roadmap-flex.md)
for the full design):

- **One time grid.** Every data channel is half-hourly UTC, keyed on the period start.
- **The forward signal is the spine.** Routes and components read it through
  `lib/forward-signal.ts` — don't add parallel queries that can disagree with it.
- **Training and serving stay decoupled.** The model runs only in the batch pipeline
  (GitHub Actions → Postgres); the web tier never runs the model.
- **Marginal logic has one source of truth**: `config/fuel-factors.json`, loaded by
  both `lib/marginal.ts` and `scripts/marginal.py`.
- **Graceful degradation.** A missing channel (no prices yet, DB down) must degrade
  visibly but never crash the dashboard.
- **Honesty over polish.** Every forecast must remain scoreable against settled
  actuals; never ship a number that can't be verified later.

## Good first contributions

The "What I'd do with more time" section of the [README](README.md) is a live
wishlist — currently: multi-point wind-weighted weather features, quantile/conformal
prediction intervals, and scoring the marginal forecast against realised marginal.
Smaller ideas: accessibility passes on the dashboard, more regional Agile tariffs,
test coverage for `lib/schedule.ts`.

## Questions

Open an issue — happy to discuss design before you write code.
