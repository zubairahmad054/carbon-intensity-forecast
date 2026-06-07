# UK Grid Carbon Intensity Forecasting Service
## Complete Engineering Guide — Vercel + Next.js + Python Serverless + Neon Postgres

---

## 1. Project Goal

Build and deploy a production-style service that **forecasts the carbon intensity of the Great Britain electricity grid 48 hours ahead**, exposed through a public REST API and a live web dashboard.

The service ingests half-hourly carbon intensity data from the official UK National Energy System Operator (NESO) Carbon Intensity API, stores it in a managed Postgres database, trains a regression model on engineered time-series features, and serves predictions through Vercel serverless Python functions consumed by a Next.js dashboard.

### What this demonstrates to a hiring manager

- **End-to-end ML engineering**, not just notebook analysis — ingestion → storage → training → serving → frontend
- **Real APIs**: consuming an external one, building your own, documenting it with OpenAPI
- **Automation & CI/CD**: GitHub Actions for scheduled ingestion, weekly retraining, and CI tests
- **Production concerns**: handling API outages, model versioning, monitoring prediction error against ground truth
- **Cloud deployment**: Vercel hosting, Neon managed Postgres, environment-based configuration
- **Domain alignment with CFP Energy**: decarbonisation, grid emissions, energy markets

### What this is NOT

This is not a research-grade forecasting system. The model is deliberately simple. The engineering around the model is the point.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui | v0-friendly, deploys to Vercel natively, server components reduce client JS |
| **Backend** | Python 3.12 serverless functions on Vercel (FastAPI-style handlers) | Co-located with frontend, single deployment, free tier sufficient |
| **Database** | Neon Postgres (free tier) | Persistent storage Vercel needs, free 0.5 GB, native Vercel integration |
| **ORM / DB client** | `psycopg` (v3) with raw SQL | Lightweight, no ORM overhead, transparent for portfolio review |
| **ML library** | scikit-learn (Ridge + GradientBoostingRegressor) | Small bundle (~30 MB), fits Vercel serverless cold-start budget |
| **Feature engineering** | pandas + numpy | Industry standard, you already know it |
| **Charting** | Recharts | React-native, works perfectly with Next.js, no canvas hassles |
| **Scheduled jobs** | GitHub Actions (cron) | Free, portable, lives next to code in repo |
| **Testing** | pytest (backend) + Vitest (frontend) | Standard tooling, fast |
| **Code quality** | ruff + black (Python), ESLint + Prettier (TS) | Standard, enforces consistency |
| **Deployment** | Vercel (auto-deploy on push to `main`) | Zero config for Next.js, supports Python functions |

### Stack choices explicitly rejected, with reasoning

- **XGBoost / LightGBM** — bundle size pushes Vercel cold start over budget; the engineering story is identical with scikit-learn
- **PyTorch / TensorFlow** — overkill for a univariate time series; would balloon the bundle
- **Docker** — Vercel runs Python as native serverless, no container needed; reduces complexity
- **Airflow / Prefect** — overengineering for a weekly retrain; GitHub Actions is simpler and equally credible
- **MLflow** — useful but adds infrastructure; we'll version models via filename + a `model_versions` DB table instead
- **Redis caching** — unnecessary at this scale; Postgres + Vercel's edge cache is enough

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   GitHub Actions                                                        │
│   ┌─────────────────────┐   ┌──────────────────────────┐                │
│   │ Hourly ingestion    │   │ Weekly model retraining  │                │
│   │ • Fetch from NESO   │   │ • Pull data from Neon    │                │
│   │ • Upsert into Neon  │   │ • Train scikit-learn     │                │
│   └──────────┬──────────┘   │ • Commit model artifact  │                │
│              │              │ • Open PR to main        │                │
│              │              └──────────┬───────────────┘                │
│              │                         │                                │
└──────────────┼─────────────────────────┼────────────────────────────────┘
               │                         │
               ▼                         ▼
       ┌───────────────┐         ┌──────────────────┐
       │ NESO Carbon   │         │ GitHub Repo      │
       │ Intensity API │         │ models/*.pkl     │
       └───────────────┘         └────────┬─────────┘
                                          │
                                          │ deploy on push
                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Vercel Deployment                            │
│                                                                         │
│   ┌──────────────────────────┐      ┌────────────────────────────┐      │
│   │ Next.js Frontend         │      │ Python Serverless Functions│      │
│   │ • /                      │◄────►│ • /api/predict             │      │
│   │ • /forecast              │      │ • /api/intensity/current   │      │
│   │ • /model                 │      │ • /api/intensity/history   │      │
│   │ • /about                 │      │ • /api/model/info          │      │
│   └──────────────────────────┘      │ • /api/health              │      │
│                                     └─────────────┬──────────────┘      │
│                                                   │                     │
└───────────────────────────────────────────────────┼─────────────────────┘
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │ Neon Postgres    │
                                          │ • observations   │
                                          │ • predictions    │
                                          │ • model_versions │
                                          └──────────────────┘
```

### Request flow examples

**User loads dashboard:**
1. Browser → Vercel Edge → Next.js server component
2. Server component calls `/api/intensity/current` and `/api/predict`
3. Python functions query Neon, load pickled model, return JSON
4. Server component renders with data; client hydrates Recharts

**GitHub Actions runs hourly ingestion:**
1. Cron triggers workflow
2. Python script fetches NESO API for the last hour
3. Upserts rows into Neon `intensity_observations`
4. Logs row count to workflow summary

**GitHub Actions runs weekly retrain:**
1. Cron triggers workflow on Sunday 03:00 UTC
2. Script pulls all observations from Neon
3. Builds features, trains model, evaluates on held-out fold
4. Saves `models/intensity_model_YYYY-MM-DD.pkl`
5. Updates `models/latest.pkl` symlink (or copy)
6. Inserts row into `model_versions` table with metrics
7. Commits to a new branch, opens PR
8. CI checks pass → merge → Vercel auto-deploys with new model

---

## 4. Data Model (Neon Postgres)

Three tables. Keep it minimal.

```sql
-- Half-hourly observations from the NESO API
CREATE TABLE intensity_observations (
    period_start    TIMESTAMPTZ PRIMARY KEY,
    period_end      TIMESTAMPTZ NOT NULL,
    forecast_gco2   INTEGER,            -- NESO's own forecast at the time
    actual_gco2     INTEGER,            -- metered actual (sometimes null until settled)
    intensity_index TEXT,               -- 'very low' | 'low' | 'moderate' | 'high' | 'very high'
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_observations_period_start ON intensity_observations (period_start DESC);

-- Predictions made by our model, stored for monitoring vs actuals
CREATE TABLE model_predictions (
    id              BIGSERIAL PRIMARY KEY,
    target_period   TIMESTAMPTZ NOT NULL,    -- which half-hour this prediction is FOR
    predicted_gco2  INTEGER NOT NULL,
    predicted_low   INTEGER,                 -- lower bound of prediction interval
    predicted_high  INTEGER,                 -- upper bound
    model_version   TEXT NOT NULL,           -- e.g. '2026-01-15'
    made_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (target_period, model_version)
);

CREATE INDEX idx_predictions_target ON model_predictions (target_period DESC);

-- Trained model metadata
CREATE TABLE model_versions (
    version         TEXT PRIMARY KEY,        -- 'YYYY-MM-DD' format
    trained_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    train_rows      INTEGER NOT NULL,
    test_mae        NUMERIC(8,2),            -- mean absolute error in gCO2/kWh
    test_rmse       NUMERIC(8,2),
    test_r2         NUMERIC(5,4),
    features_used   TEXT[]                   -- list of feature names
);
```

Notes:
- All timestamps are `TIMESTAMPTZ` and stored in UTC. The NESO API returns UTC timestamps; we never store local time.
- `intensity_observations` uses `period_start` as PK because each half-hour appears exactly once. UPSERT (`ON CONFLICT DO UPDATE`) handles late-arriving `actual_gco2` values that initially came in as null.
- `model_predictions` stores every prediction so we can later compute backtested accuracy without re-running the model.

---

## 5. Repository Structure

```
carbon-intensity-forecast/
├── README.md
├── .gitignore
├── .env.example
├── vercel.json                       # Vercel config (Python runtime, routes)
├── package.json                      # Next.js dependencies
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
│
├── app/                              # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx                      # Dashboard home
│   ├── forecast/page.tsx             # 48h forecast detail
│   ├── model/page.tsx                # Model info & metrics
│   ├── about/page.tsx
│   ├── globals.css
│   └── components/
│       ├── IntensityGauge.tsx
│       ├── ForecastChart.tsx
│       ├── HistoryChart.tsx
│       ├── BestTimePanel.tsx
│       └── ModelMetricsCard.tsx
│
├── lib/                              # TS utilities
│   ├── api-client.ts                 # typed fetch wrappers for /api/*
│   └── format.ts                     # date/number formatting helpers
│
├── api/                              # Vercel Python serverless functions
│   ├── _shared/                      # not a route — shared modules
│   │   ├── __init__.py
│   │   ├── db.py                     # psycopg connection helpers
│   │   ├── model.py                  # model loading + prediction
│   │   ├── features.py               # feature engineering (shared with training)
│   │   └── neso.py                   # NESO API client
│   ├── predict.py                    # GET /api/predict
│   ├── health.py                     # GET /api/health
│   ├── intensity/
│   │   ├── current.py                # GET /api/intensity/current
│   │   └── history.py                # GET /api/intensity/history
│   └── model/
│       └── info.py                   # GET /api/model/info
│
├── scripts/                          # Run by GitHub Actions, NOT deployed
│   ├── ingest.py                     # hourly ingestion job
│   ├── train.py                      # weekly training job
│   └── backfill.py                   # one-off: backfill historical data
│
├── models/                           # Committed model artifacts
│   ├── latest.pkl                    # symlink or copy of current model
│   └── README.md                     # describes versioning scheme
│
├── tests/
│   ├── test_features.py
│   ├── test_neso_client.py
│   └── test_model.py
│
├── requirements.txt                  # Python deps for Vercel runtime
├── requirements-dev.txt              # Adds pytest, ruff, black
│
└── .github/
    └── workflows/
        ├── ingest.yml                # hourly cron
        ├── train.yml                 # weekly cron
        └── ci.yml                    # tests + lint on PR
```

### Why this structure

- `api/` at the project root is **Vercel convention** for serverless functions. Each `.py` file becomes a route.
- `api/_shared/` is prefixed with underscore so Vercel doesn't expose it as a route, but Python can still import from it.
- `scripts/` lives outside `api/` because GitHub Actions runs it, not Vercel.
- `models/` is committed so Vercel functions can load `models/latest.pkl` at runtime. Yes, this means the model lives in Git — it's small (~50 KB), it gives you version control for free, and it's simpler than blob storage for a project this size.
- `app/` and `lib/` are standard Next.js. `app/components/` is colocated rather than top-level `components/` — easier mental model.

---

## 6. Step-by-Step Build Order

Build in this order. Each phase produces a working, deployable state.

| Phase | Outcome |
|---|---|
| 1 | Project skeleton, Neon connected, dashboard shell deployed |
| 2 | Hourly ingestion live, database filling with real data |
| 3 | Model trained locally, evaluation metrics recorded |
| 4 | `/api/predict` returning live forecasts |
| 5 | Dashboard rendering live data and forecasts |
| 6 | GitHub Actions automating ingestion + retraining |
| 7 | Tests, monitoring, polish |

Do not skip ahead. Each phase depends on the previous one being deployed.

---

## 7. Phase 1 — Foundation

### 7.1 Provision Neon

1. Sign up at neon.tech (free, no card needed).
2. Create a new project: name it `carbon-intensity`, region closest to London (Frankfurt or London).
3. Copy the connection string from the dashboard. It looks like:
   ```
   postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Open the Neon SQL editor and run the three `CREATE TABLE` statements from Section 4.

### 7.2 Initialise the repo

```bash
# Locally
npx create-next-app@latest carbon-intensity-forecast \
  --typescript --tailwind --app --no-src-dir --import-alias "@/*"

cd carbon-intensity-forecast

# Initialise Python side
mkdir -p api/_shared api/intensity api/model scripts models tests
touch api/_shared/__init__.py
touch requirements.txt requirements-dev.txt .env.example vercel.json
```

### 7.3 `vercel.json`

```json
{
  "functions": {
    "api/**/*.py": {
      "runtime": "python3.12",
      "maxDuration": 10
    }
  },
  "crons": []
}
```

### 7.4 `requirements.txt` (Vercel runtime — keep minimal)

```
psycopg[binary]==3.2.3
scikit-learn==1.5.2
pandas==2.2.3
numpy==2.1.3
httpx==0.27.2
```

### 7.5 `requirements-dev.txt`

```
-r requirements.txt
pytest==8.3.3
pytest-mock==3.14.0
ruff==0.7.4
black==24.10.0
python-dotenv==1.0.1
```

### 7.6 `.env.example`

```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
NESO_API_BASE=https://api.carbonintensity.org.uk
MODEL_PATH=models/latest.pkl
```

### 7.7 Connect Neon to Vercel

1. Push the empty repo to GitHub.
2. Import the repo into Vercel (Add New Project → Import from GitHub).
3. In Vercel project settings → Storage → Add Integration → Neon → connect existing project.
4. Vercel auto-populates `DATABASE_URL` in environment variables.
5. Trigger a first deploy. The Next.js homepage should render.

### 7.8 First commit checkpoint

You should now have:
- ✅ Vercel project deployed (default Next.js page)
- ✅ Neon database with three empty tables
- ✅ `DATABASE_URL` set in Vercel env vars
- ✅ Repo structure in place

---

## 8. Phase 2 — Data Ingestion

### 8.1 Build the NESO client

Create `api/_shared/neso.py`:

```python
"""Client for the NESO Carbon Intensity API.
Docs: https://carbon-intensity.github.io/api-definitions/
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
import httpx

NESO_BASE = "https://api.carbonintensity.org.uk"

@dataclass
class IntensityRecord:
    period_start: datetime
    period_end: datetime
    forecast_gco2: int | None
    actual_gco2: int | None
    intensity_index: str | None

def _parse(item: dict) -> IntensityRecord:
    return IntensityRecord(
        period_start=datetime.fromisoformat(item["from"].replace("Z", "+00:00")),
        period_end=datetime.fromisoformat(item["to"].replace("Z", "+00:00")),
        forecast_gco2=item["intensity"].get("forecast"),
        actual_gco2=item["intensity"].get("actual"),
        intensity_index=item["intensity"].get("index"),
    )

def fetch_date(date: str) -> list[IntensityRecord]:
    """Fetch all 48 half-hourly periods for a given YYYY-MM-DD date."""
    url = f"{NESO_BASE}/intensity/date/{date}"
    with httpx.Client(timeout=10.0) as client:
        r = client.get(url)
        r.raise_for_status()
        return [_parse(item) for item in r.json()["data"]]

def fetch_current() -> IntensityRecord:
    """Fetch the current half-hour's intensity."""
    url = f"{NESO_BASE}/intensity"
    with httpx.Client(timeout=10.0) as client:
        r = client.get(url)
        r.raise_for_status()
        return _parse(r.json()["data"][0])

def fetch_forecast_48h() -> list[IntensityRecord]:
    """Fetch NESO's own 48h forecast — useful as a baseline to compare against."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    url = f"{NESO_BASE}/intensity/{now}/fw48h"
    with httpx.Client(timeout=10.0) as client:
        r = client.get(url)
        r.raise_for_status()
        return [_parse(item) for item in r.json()["data"]]
```

### 8.2 Build the DB helper

Create `api/_shared/db.py`:

```python
"""Shared database helpers. Single connection per invocation."""
from __future__ import annotations
import os
from contextlib import contextmanager
import psycopg

def _dsn() -> str:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL not set")
    return dsn

@contextmanager
def get_conn():
    with psycopg.connect(_dsn(), autocommit=False) as conn:
        yield conn

def upsert_observations(records: list) -> int:
    """Upsert a list of IntensityRecord into intensity_observations.
    Returns the number of rows affected.
    """
    if not records:
        return 0
    rows = [
        (r.period_start, r.period_end, r.forecast_gco2, r.actual_gco2, r.intensity_index)
        for r in records
    ]
    sql = """
        INSERT INTO intensity_observations
          (period_start, period_end, forecast_gco2, actual_gco2, intensity_index)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (period_start) DO UPDATE SET
          period_end      = EXCLUDED.period_end,
          forecast_gco2   = COALESCE(EXCLUDED.forecast_gco2, intensity_observations.forecast_gco2),
          actual_gco2     = COALESCE(EXCLUDED.actual_gco2, intensity_observations.actual_gco2),
          intensity_index = EXCLUDED.intensity_index,
          ingested_at     = NOW();
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
            conn.commit()
            return len(rows)
```

### 8.3 Build the ingest script

Create `scripts/ingest.py`:

```python
"""Hourly ingestion job. Run by GitHub Actions."""
from __future__ import annotations
import sys, os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api._shared import neso, db

def main() -> int:
    # Re-fetch today and yesterday — captures late-arriving 'actual' values.
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)

    all_records = []
    for d in (yesterday, today):
        records = neso.fetch_date(d.isoformat())
        all_records.extend(records)
        print(f"Fetched {len(records)} records for {d.isoformat()}")

    n = db.upsert_observations(all_records)
    print(f"Upserted {n} rows")
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

### 8.4 Build the backfill script

Create `scripts/backfill.py`:

```python
"""One-off: backfill historical data. Run this once locally before first training."""
from __future__ import annotations
import sys, os, time
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api._shared import neso, db

DAYS_BACK = 365   # 1 year of half-hourly data ~ 17,500 rows

def main() -> int:
    end = date.today()
    start = end - timedelta(days=DAYS_BACK)
    cursor = start
    total = 0
    while cursor <= end:
        try:
            records = neso.fetch_date(cursor.isoformat())
            n = db.upsert_observations(records)
            total += n
            print(f"{cursor.isoformat()}: {n} rows (total {total})")
        except Exception as e:
            print(f"FAILED {cursor.isoformat()}: {e}")
        cursor += timedelta(days=1)
        time.sleep(0.3)   # be polite
    print(f"Done. Total rows: {total}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

### 8.5 Run the backfill locally

```bash
# Create a .env from the example, fill in your Neon DATABASE_URL
cp .env.example .env

# In a Python venv:
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt

# Run backfill
set -a; source .env; set +a   # exports env vars (or use python-dotenv)
python scripts/backfill.py
```

This takes ~5 minutes and fills your Neon DB with a year of half-hourly observations.

### 8.6 Phase 2 checkpoint

Run a sanity query in the Neon SQL editor:
```sql
SELECT COUNT(*), MIN(period_start), MAX(period_start) FROM intensity_observations;
```

Expect ~17,000 rows spanning roughly the last year.

---

## 9. Phase 3 — Feature Engineering & Model Training

### 9.1 Feature engineering module

Create `api/_shared/features.py`. **This module is used by both training and prediction — keep it pure and deterministic.**

```python
"""Feature engineering for carbon intensity forecasting.
Shared between training (scripts/train.py) and inference (api/predict.py).
"""
from __future__ import annotations
import pandas as pd
import numpy as np

FEATURE_COLUMNS = [
    "hour", "minute", "dayofweek", "month", "is_weekend",
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
    "lag_48", "lag_336", "rolling_48_mean", "rolling_48_std",
]

def build_features(df: pd.DataFrame, target_col: str = "actual_gco2") -> pd.DataFrame:
    """Given a dataframe with a 'period_start' index and target_col, add features.
    Returns a new dataframe with FEATURE_COLUMNS + target_col, indexed by period_start.
    Rows with NaN features (early ones lacking lags) are dropped.
    """
    df = df.sort_values("period_start").copy()
    df["period_start"] = pd.to_datetime(df["period_start"], utc=True)
    df = df.set_index("period_start")

    # Calendar features
    df["hour"] = df.index.hour
    df["minute"] = df.index.minute
    df["dayofweek"] = df.index.dayofweek
    df["month"] = df.index.month
    df["is_weekend"] = (df["dayofweek"] >= 5).astype(int)

    # Cyclical encoding (so 23:00 and 00:00 are "close")
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["dow_sin"] = np.sin(2 * np.pi * df["dayofweek"] / 7)
    df["dow_cos"] = np.cos(2 * np.pi * df["dayofweek"] / 7)

    # Lag features (in half-hours): 48 = 1 day ago, 336 = 1 week ago
    df["lag_48"] = df[target_col].shift(48)
    df["lag_336"] = df[target_col].shift(336)

    # Rolling stats from the last 24h (excluding current)
    df["rolling_48_mean"] = df[target_col].shift(1).rolling(48).mean()
    df["rolling_48_std"] = df[target_col].shift(1).rolling(48).std()

    return df[FEATURE_COLUMNS + [target_col]].dropna()


def build_inference_features(history: pd.DataFrame, target_periods: pd.DatetimeIndex) -> pd.DataFrame:
    """For predictions, build features for FUTURE periods using known history.
    `history` must contain actual_gco2 up to the most recent settled period.
    `target_periods` is a DatetimeIndex of future half-hours to predict.

    For multi-step forecasts, lag/rolling features for far-future periods use
    the most recent known values — i.e. we don't recursively forecast.
    This is a deliberate simplification documented in the README.
    """
    history = history.sort_values("period_start").copy()
    history["period_start"] = pd.to_datetime(history["period_start"], utc=True)
    history = history.set_index("period_start")
    target = history["actual_gco2"]

    rows = []
    for period in target_periods:
        row = {
            "period_start": period,
            "hour": period.hour,
            "minute": period.minute,
            "dayofweek": period.dayofweek,
            "month": period.month,
            "is_weekend": int(period.dayofweek >= 5),
            "hour_sin": np.sin(2 * np.pi * period.hour / 24),
            "hour_cos": np.cos(2 * np.pi * period.hour / 24),
            "dow_sin": np.sin(2 * np.pi * period.dayofweek / 7),
            "dow_cos": np.cos(2 * np.pi * period.dayofweek / 7),
            # Lag from the most recent settled data, not recursive
            "lag_48": target.iloc[-48] if len(target) >= 48 else target.mean(),
            "lag_336": target.iloc[-336] if len(target) >= 336 else target.mean(),
            "rolling_48_mean": target.iloc[-48:].mean(),
            "rolling_48_std": target.iloc[-48:].std(),
        }
        rows.append(row)
    return pd.DataFrame(rows).set_index("period_start")[FEATURE_COLUMNS]
```

### 9.2 Training script

Create `scripts/train.py`:

```python
"""Weekly model training. Outputs models/intensity_model_YYYY-MM-DD.pkl
and writes a row to model_versions in Neon.
"""
from __future__ import annotations
import sys, os, pickle
from datetime import date
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api._shared import db, features

def load_data() -> pd.DataFrame:
    sql = """
      SELECT period_start, actual_gco2
      FROM intensity_observations
      WHERE actual_gco2 IS NOT NULL
      ORDER BY period_start
    """
    with db.get_conn() as conn:
        return pd.read_sql(sql, conn)

def train_and_save() -> dict:
    df = load_data()
    print(f"Loaded {len(df)} rows")
    feat_df = features.build_features(df, target_col="actual_gco2")
    print(f"After feature engineering: {len(feat_df)} rows")

    # Time-aware split: last 14 days as test
    cutoff = feat_df.index.max() - pd.Timedelta(days=14)
    train = feat_df[feat_df.index <= cutoff]
    test = feat_df[feat_df.index > cutoff]
    print(f"Train: {len(train)}, Test: {len(test)}")

    X_train = train[features.FEATURE_COLUMNS]
    y_train = train["actual_gco2"]
    X_test = test[features.FEATURE_COLUMNS]
    y_test = test["actual_gco2"]

    model = GradientBoostingRegressor(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        random_state=42,
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    r2 = r2_score(y_test, preds)
    print(f"MAE: {mae:.2f}  RMSE: {rmse:.2f}  R²: {r2:.4f}")

    version = date.today().isoformat()
    out_path = f"models/intensity_model_{version}.pkl"
    latest_path = "models/latest.pkl"
    os.makedirs("models", exist_ok=True)
    with open(out_path, "wb") as f:
        pickle.dump({
            "model": model,
            "version": version,
            "features": features.FEATURE_COLUMNS,
        }, f)
    # Overwrite latest.pkl
    with open(latest_path, "wb") as f:
        pickle.dump({
            "model": model,
            "version": version,
            "features": features.FEATURE_COLUMNS,
        }, f)
    print(f"Saved {out_path} and {latest_path}")

    # Record in Neon
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_versions
                  (version, train_rows, test_mae, test_rmse, test_r2, features_used)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (version) DO UPDATE SET
                  trained_at = NOW(),
                  train_rows = EXCLUDED.train_rows,
                  test_mae = EXCLUDED.test_mae,
                  test_rmse = EXCLUDED.test_rmse,
                  test_r2 = EXCLUDED.test_r2,
                  features_used = EXCLUDED.features_used
                """,
                (version, len(train), float(mae), float(rmse), float(r2), features.FEATURE_COLUMNS),
            )
            conn.commit()

    return {"version": version, "mae": mae, "rmse": rmse, "r2": r2}

if __name__ == "__main__":
    result = train_and_save()
    print(result)
```

### 9.3 Run training locally

```bash
python scripts/train.py
```

Expect MAE somewhere in the range of 15–35 gCO2/kWh. Lower is better. (For reference, GB grid intensity typically ranges 50–400 gCO2/kWh.)

### 9.4 Phase 3 checkpoint

- ✅ `models/latest.pkl` exists in repo
- ✅ A row exists in `model_versions` table in Neon
- ✅ Commit and push everything

---

## 10. Phase 4 — Serverless API

Each file in `api/` becomes a route. Vercel Python functions have a specific signature using BaseHTTPRequestHandler. We'll wrap it in a helper for clarity.

### 10.1 Model loader (`api/_shared/model.py`)

```python
"""Model loading with module-level cache.
Vercel keeps warm containers around, so this load happens once per cold start.
"""
from __future__ import annotations
import os, pickle
from functools import lru_cache

MODEL_PATH = os.environ.get("MODEL_PATH", "models/latest.pkl")

@lru_cache(maxsize=1)
def load_model():
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)
```

### 10.2 `/api/health` — sanity check

`api/health.py`:

```python
from http.server import BaseHTTPRequestHandler
import json, sys

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            from api._shared import db, model
            with db.get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            m = model.load_model()
            body = {
                "status": "ok",
                "model_version": m["version"],
                "python": sys.version,
            }
            self.send_response(200)
        except Exception as e:
            body = {"status": "error", "error": str(e)}
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
```

### 10.3 `/api/intensity/current`

`api/intensity/current.py`:

```python
from http.server import BaseHTTPRequestHandler
import json
from api._shared import db

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        sql = """
          SELECT period_start, period_end, forecast_gco2, actual_gco2, intensity_index
          FROM intensity_observations
          WHERE actual_gco2 IS NOT NULL
          ORDER BY period_start DESC
          LIMIT 1
        """
        try:
            with db.get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql)
                    row = cur.fetchone()
            if not row:
                body = {"error": "no_data"}
                self.send_response(404)
            else:
                body = {
                    "period_start": row[0].isoformat(),
                    "period_end": row[1].isoformat(),
                    "forecast_gco2": row[2],
                    "actual_gco2": row[3],
                    "intensity_index": row[4],
                }
                self.send_response(200)
        except Exception as e:
            body = {"error": str(e)}
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "public, max-age=300")  # 5 min edge cache
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
```

### 10.4 `/api/intensity/history`

`api/intensity/history.py`:

```python
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
from api._shared import db

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        hours = int(qs.get("hours", ["168"])[0])   # default 7 days
        hours = min(hours, 720)                    # cap at 30 days

        sql = """
          SELECT period_start, actual_gco2, forecast_gco2, intensity_index
          FROM intensity_observations
          WHERE period_start >= NOW() - %s::interval
          ORDER BY period_start
        """
        try:
            with db.get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, (f"{hours} hours",))
                    rows = cur.fetchall()
            body = {
                "data": [
                    {
                        "period_start": r[0].isoformat(),
                        "actual_gco2": r[1],
                        "forecast_gco2": r[2],
                        "intensity_index": r[3],
                    }
                    for r in rows
                ]
            }
            self.send_response(200)
        except Exception as e:
            body = {"error": str(e)}
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "public, max-age=600")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
```

### 10.5 `/api/predict` — the main event

`api/predict.py`:

```python
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta, timezone
import json
import numpy as np
import pandas as pd
from api._shared import db, model, features

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        hours = int(qs.get("hours", ["48"])[0])
        hours = min(max(hours, 1), 48)   # 1..48
        n_periods = hours * 2            # half-hours

        try:
            # Load history (need at least 7 days for lags)
            with db.get_conn() as conn:
                history = pd.read_sql(
                    """
                    SELECT period_start, actual_gco2
                    FROM intensity_observations
                    WHERE actual_gco2 IS NOT NULL
                      AND period_start >= NOW() - INTERVAL '14 days'
                    ORDER BY period_start
                    """,
                    conn,
                )

            # Generate target periods
            last_period = pd.to_datetime(history["period_start"].iloc[-1], utc=True)
            target_periods = pd.date_range(
                start=last_period + pd.Timedelta(minutes=30),
                periods=n_periods,
                freq="30min",
                tz="UTC",
            )

            # Build features for each target
            X = features.build_inference_features(history, target_periods)

            # Predict
            m = model.load_model()
            preds = m["model"].predict(X[m["features"]])

            # Naive prediction interval: ±RMSE from last training
            with db.get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT test_rmse FROM model_versions WHERE version = %s",
                        (m["version"],),
                    )
                    row = cur.fetchone()
                    rmse = float(row[0]) if row else 25.0

            body = {
                "model_version": m["version"],
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "predictions": [
                    {
                        "period_start": p.isoformat(),
                        "predicted_gco2": int(round(v)),
                        "predicted_low": int(round(v - 1.96 * rmse)),
                        "predicted_high": int(round(v + 1.96 * rmse)),
                    }
                    for p, v in zip(target_periods, preds)
                ],
            }
            self.send_response(200)
        except Exception as e:
            body = {"error": str(e)}
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "public, max-age=900")  # 15 min
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
```

### 10.6 `/api/model/info`

`api/model/info.py`:

```python
from http.server import BaseHTTPRequestHandler
import json
from api._shared import db, model

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            m = model.load_model()
            with db.get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT version, trained_at, train_rows, test_mae,
                               test_rmse, test_r2, features_used
                        FROM model_versions
                        WHERE version = %s
                        """,
                        (m["version"],),
                    )
                    row = cur.fetchone()
            body = {
                "version": row[0],
                "trained_at": row[1].isoformat(),
                "train_rows": row[2],
                "test_mae": float(row[3]),
                "test_rmse": float(row[4]),
                "test_r2": float(row[5]),
                "features": row[6],
            }
            self.send_response(200)
        except Exception as e:
            body = {"error": str(e)}
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
```

### 10.7 Deploy and test

```bash
git add . && git commit -m "Phase 4: API layer" && git push
```

Vercel auto-deploys. Then test:

```bash
curl https://your-app.vercel.app/api/health
curl https://your-app.vercel.app/api/intensity/current
curl "https://your-app.vercel.app/api/predict?hours=24"
curl https://your-app.vercel.app/api/model/info
```

### 10.8 Phase 4 checkpoint

All five endpoints return valid JSON. `/api/predict?hours=48` returns 96 half-hourly forecast points.

---

## 11. Phase 5 — Frontend Dashboard (v0 prompts)

This is where v0 shines. Build it one component at a time using the prompts below. Each prompt is ready to paste into v0 — just replace the API URL placeholder with your actual Vercel domain.

### 11.1 Setup shadcn/ui

```bash
npx shadcn@latest init -d
npx shadcn@latest add card badge button tabs alert
npm install recharts
```

### 11.2 Typed API client

Create `lib/api-client.ts`:

```typescript
const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export interface CurrentIntensity {
  period_start: string;
  period_end: string;
  forecast_gco2: number | null;
  actual_gco2: number | null;
  intensity_index: string | null;
}

export interface PredictionPoint {
  period_start: string;
  predicted_gco2: number;
  predicted_low: number;
  predicted_high: number;
}

export interface PredictionResponse {
  model_version: string;
  generated_at: string;
  predictions: PredictionPoint[];
}

export interface HistoryPoint {
  period_start: string;
  actual_gco2: number | null;
  forecast_gco2: number | null;
  intensity_index: string | null;
}

export interface ModelInfo {
  version: string;
  trained_at: string;
  train_rows: number;
  test_mae: number;
  test_rmse: number;
  test_r2: number;
  features: string[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  current: () => fetchJson<CurrentIntensity>("/api/intensity/current"),
  history: (hours = 168) => fetchJson<{ data: HistoryPoint[] }>(`/api/intensity/history?hours=${hours}`),
  predict: (hours = 48) => fetchJson<PredictionResponse>(`/api/predict?hours=${hours}`),
  modelInfo: () => fetchJson<ModelInfo>("/api/model/info"),
};
```

### 11.3 v0 Prompt 1 — Intensity Gauge Component

> Build a React component called `IntensityGauge` using Tailwind and shadcn/ui. It takes props `{ value: number, index: 'very low' | 'low' | 'moderate' | 'high' | 'very high', updatedAt: string }`. Display a large circular gauge showing the current carbon intensity in gCO2/kWh. Colour-code by index: very low = emerald, low = green, moderate = amber, high = orange, very high = red. Below the number, show the index as a Badge and the relative time since `updatedAt` ("2 minutes ago"). Use a clean, minimal style — think Stripe dashboard, not Bootstrap. The component should be a server component and accept already-fetched data, no useEffect.

### 11.4 v0 Prompt 2 — Forecast Chart Component

> Build a React component called `ForecastChart` using Recharts. It takes a prop `predictions: { period_start: string, predicted_gco2: number, predicted_low: number, predicted_high: number }[]`. Render a line chart of `predicted_gco2` over time with a shaded confidence band between `predicted_low` and `predicted_high`. X-axis shows time in user's local timezone with format "HH:mm" for points within today and "dd MMM HH:mm" for points beyond today. Y-axis labeled "gCO2/kWh". Use a single primary colour (emerald-500) for the line and emerald-200 with 40% opacity for the band. Include a vertical reference line at the current time. Make the chart responsive and at least 400px tall. Tooltip should show the predicted value with low/high range. This is a client component.

### 11.5 v0 Prompt 3 — History Chart Component

> Build a React component `HistoryChart` using Recharts. Props: `data: { period_start: string, actual_gco2: number, forecast_gco2: number }[]`. Render two lines: actual (solid, slate-700) and NESO's forecast (dashed, slate-400). Default to showing 7 days. Add buttons above the chart to switch between 24h / 7d / 30d ranges (client-side filter, no re-fetch). Tooltip shows both values. Responsive, 350px tall. Client component.

### 11.6 v0 Prompt 4 — Best Time Panel

> Build a React component `BestTimePanel` that takes `predictions: { period_start: string, predicted_gco2: number }[]` for the next 24 hours. From those predictions, find the 4-hour window with the lowest average predicted intensity. Display a Card with: a headline "Best 4-hour window for low-carbon electricity", the time range in local timezone (e.g. "Tomorrow, 02:00 – 06:00"), and the average predicted intensity for that window in large text. Use shadcn/ui Card. Below, add small text: "Compare to today's average of X gCO2/kWh" where X is computed from the same array. Server component.

### 11.7 v0 Prompt 5 — Model Metrics Card

> Build a React component `ModelMetricsCard` that takes a `ModelInfo` prop with fields `version`, `trained_at`, `train_rows`, `test_mae`, `test_rmse`, `test_r2`, `features`. Display in a shadcn/ui Card: version as a Badge, "Trained {relative time}" in muted text, then a 2x2 grid of stats (MAE, RMSE, R², Training rows) each labelled and large-numeric. Below, a collapsible section listing the features used (chips/badges). Server component.

### 11.8 Compose the dashboard

Create `app/page.tsx`:

```tsx
import { api } from "@/lib/api-client";
import { IntensityGauge } from "@/app/components/IntensityGauge";
import { ForecastChart } from "@/app/components/ForecastChart";
import { HistoryChart } from "@/app/components/HistoryChart";
import { BestTimePanel } from "@/app/components/BestTimePanel";

export const revalidate = 300;

export default async function Home() {
  const [current, predictions, history] = await Promise.all([
    api.current(),
    api.predict(48),
    api.history(168),
  ]);

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">UK Grid Carbon Intensity</h1>
        <p className="text-slate-600">
          Live forecast of carbon emissions per kWh on the GB electricity grid.
          Updated every 30 minutes.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <IntensityGauge
          value={current.actual_gco2 ?? current.forecast_gco2 ?? 0}
          index={(current.intensity_index ?? "moderate") as any}
          updatedAt={current.period_end}
        />
        <div className="lg:col-span-2">
          <BestTimePanel predictions={predictions.predictions.slice(0, 48)} />
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">48-hour forecast</h2>
        <ForecastChart predictions={predictions.predictions} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Last 7 days</h2>
        <HistoryChart data={history.data} />
      </section>

      <footer className="text-sm text-slate-500 pt-8 border-t">
        Data from National Energy System Operator (Carbon Intensity API, CC BY 4.0).
        Forecasts are produced by a scikit-learn GradientBoosting model retrained weekly.
      </footer>
    </main>
  );
}
```

Create `app/model/page.tsx`:

```tsx
import { api } from "@/lib/api-client";
import { ModelMetricsCard } from "@/app/components/ModelMetricsCard";

export const revalidate = 3600;

export default async function ModelPage() {
  const info = await api.modelInfo();
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Model</h1>
      <ModelMetricsCard info={info} />
      <section className="prose">
        <h2>How it works</h2>
        <p>
          A scikit-learn GradientBoostingRegressor trained on roughly a year of
          half-hourly carbon intensity observations from the NESO API. Features
          are calendar-based (hour of day, day of week, month) plus lags from
          one day and one week prior, plus a 24-hour rolling mean and standard
          deviation.
        </p>
        <h2>Limitations</h2>
        <p>
          The model produces a static 48-hour forecast from the most recent
          settled period; it does not recursively predict using its own
          predictions as inputs for future periods. The prediction interval is
          a naive ±1.96·RMSE band and does not adapt to local uncertainty.
        </p>
      </section>
    </main>
  );
}
```

### 11.9 Phase 5 checkpoint

Push, wait for deploy, open the live URL. The dashboard should render with real data. If anything is broken, check the Vercel function logs.

---

## 12. Phase 6 — Automation (GitHub Actions)

### 12.1 Hourly ingestion workflow

Create `.github/workflows/ingest.yml`:

```yaml
name: Hourly ingestion
on:
  schedule:
    - cron: "5 * * * *"   # every hour at :05
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
      - run: pip install -r requirements.txt
      - run: python scripts/ingest.py
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Add `DATABASE_URL` to your repo's Actions secrets (Settings → Secrets and variables → Actions).

### 12.2 Weekly retraining workflow

Create `.github/workflows/train.yml`:

```yaml
name: Weekly retraining
on:
  schedule:
    - cron: "0 3 * * 0"   # Sundays at 03:00 UTC
  workflow_dispatch:

jobs:
  train:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
      - run: pip install -r requirements-dev.txt
      - run: python scripts/train.py
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - name: Commit and open PR
        uses: peter-evans/create-pull-request@v7
        with:
          commit-message: "chore: weekly model retrain"
          title: "Weekly model retrain"
          body: "Automated retrain. Check `model_versions` table for new metrics."
          branch: auto/retrain-${{ github.run_id }}
          add-paths: |
            models/latest.pkl
            models/intensity_model_*.pkl
```

The PR-based flow gives you a chance to sanity-check metrics before deploying. If you want fully automatic deployment, push directly to `main` instead — but the PR approach is the more defensible engineering decision.

### 12.3 CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: "pip" }
      - run: pip install -r requirements-dev.txt
      - run: ruff check .
      - run: black --check .
      - run: pytest -q

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

### 12.4 Phase 6 checkpoint

Manually trigger each workflow from the Actions tab to confirm they work. After 24 hours, you should see fresh rows in `intensity_observations` arriving hourly.

---

## 13. Phase 7 — Testing & Polish

### 13.1 Tests for feature engineering

Create `tests/test_features.py`:

```python
import pandas as pd
import numpy as np
from api._shared.features import build_features, FEATURE_COLUMNS

def test_build_features_produces_expected_columns():
    idx = pd.date_range("2024-01-01", periods=500, freq="30min", tz="UTC")
    df = pd.DataFrame({
        "period_start": idx,
        "actual_gco2": np.random.randint(50, 400, size=len(idx)),
    })
    out = build_features(df)
    for col in FEATURE_COLUMNS:
        assert col in out.columns
    assert "actual_gco2" in out.columns
    # We lose ~336 rows to the longest lag
    assert len(out) > 0

def test_cyclical_encoding_bounds():
    idx = pd.date_range("2024-01-01", periods=500, freq="30min", tz="UTC")
    df = pd.DataFrame({
        "period_start": idx,
        "actual_gco2": np.random.randint(50, 400, size=len(idx)),
    })
    out = build_features(df)
    assert out["hour_sin"].between(-1, 1).all()
    assert out["hour_cos"].between(-1, 1).all()
```

### 13.2 Tests for NESO client

Create `tests/test_neso_client.py`:

```python
from unittest.mock import patch, MagicMock
from api._shared.neso import fetch_date

@patch("api._shared.neso.httpx.Client")
def test_fetch_date_parses_response(mock_client):
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "data": [
            {
                "from": "2024-01-20T12:00Z",
                "to": "2024-01-20T12:30Z",
                "intensity": {"forecast": 266, "actual": 263, "index": "moderate"},
            }
        ]
    }
    mock_response.raise_for_status = MagicMock()
    mock_client.return_value.__enter__.return_value.get.return_value = mock_response
    records = fetch_date("2024-01-20")
    assert len(records) == 1
    assert records[0].forecast_gco2 == 266
    assert records[0].actual_gco2 == 263
    assert records[0].intensity_index == "moderate"
```

### 13.3 README that pulls its weight

A good README is the single biggest portfolio multiplier. Include:

1. **One-paragraph elevator pitch** (what it is, why it exists)
2. **Live demo URL** at the top
3. **Architecture diagram** (copy the ASCII one from Section 3)
4. **API documentation** (list every endpoint with example request/response)
5. **Local development** (how to run it)
6. **How the model works** (one section, ~200 words)
7. **Known limitations** (be honest — this is where signal lives)
8. **What I'd do with more time** (shows you can self-assess)

### 13.4 Add prediction logging (optional but powerful)

Modify `api/predict.py` to also INSERT every prediction into `model_predictions`. Then write a small `scripts/evaluate_predictions.py` that joins `model_predictions` with `intensity_observations` once `actual_gco2` is settled, and outputs realised MAE. **This is the kind of monitoring that makes a portfolio project look real.**

---

## 14. Deployment Checklist

Before you point the world at your project:

- [ ] `DATABASE_URL` set in Vercel env vars
- [ ] `DATABASE_URL` set in GitHub Actions secrets
- [ ] Backfill has completed (>15,000 rows in `intensity_observations`)
- [ ] `models/latest.pkl` is committed and not in `.gitignore`
- [ ] All five `/api/*` endpoints return 200
- [ ] Hourly ingest workflow has run successfully at least once
- [ ] Weekly train workflow has run successfully at least once
- [ ] CI workflow passes on a clean branch
- [ ] README has a working live URL at the top
- [ ] Repo has an MIT or Apache 2.0 LICENSE
- [ ] No secrets in commit history (`git log -p | grep -i secret`)

---

## 15. Portfolio Talking Points

When this comes up in an interview, lead with the engineering story, not the model. Some prompts:

**"Walk me through this project."**
> Forecasting GB grid carbon intensity 48 hours ahead. The interesting part isn't the model — it's everything around the model. Half-hourly ingestion via GitHub Actions, persistent storage in Postgres, weekly retraining that opens a PR with new metrics, serverless Python functions serving predictions, and a Next.js dashboard. End-to-end on Vercel.

**"Why scikit-learn and not XGBoost?"**
> Bundle size. Vercel serverless functions have a 250 MB unzipped limit and cold starts get slower with bigger dependencies. The model isn't the bottleneck — feature engineering and operational concerns are. Scikit-learn's GradientBoosting gets within a few points of XGBoost on this kind of time series, and the deployment story is much simpler.

**"How would you make this production-grade?"**
> Three things. First, the prediction interval is naive — ±1.96·RMSE is a flat band, it should adapt to local uncertainty using quantile regression or conformal prediction. Second, multi-step forecasting currently uses fixed lag features rather than recursive prediction, which leaks information from the present. Third, there's no alerting on model drift — I'd add a Slack notification if realised MAE exceeds training MAE by more than 50% week-on-week.

**"What surprised you while building it?"**
> The half-hourly settlement model. The NESO API returns "actual" values that are sometimes null for the most recent few periods because the metered data isn't settled yet. I initially had a bug where the most recent observation was always missing from training. Fixed it with an UPSERT that updates `actual_gco2` whenever a late settlement arrives.

**"How does this relate to what CFP does?"**
> Carbon intensity drives the value of an emissions allowance. Lower-carbon grids mean lower compliance demand, which is one of many factors that move EUA prices. The data and engineering patterns are directly analogous — public market data feeds, scheduled ingestion, time-series modelling, serving predictions to internal users. Different commodity, same shape.

---

## 16. Common Pitfalls

| Pitfall | Fix |
|---|---|
| Vercel function times out on first call | Cold start; subsequent calls are <1s. Warm with a cron to /api/health. |
| `models/latest.pkl` missing in Vercel deploy | Ensure it's not in `.gitignore` and `models/` is committed. |
| `psycopg.OperationalError: SSL` on local dev | Add `?sslmode=require` to your local `DATABASE_URL`. |
| Hourly cron not firing | GitHub disables scheduled workflows after 60 days of repo inactivity. Push periodically. |
| Forecast looks flat | Lag features dominate; check that history has variance and that `actual_gco2` isn't mostly null. |
| Dashboard shows stale data | Lower `revalidate` in `app/page.tsx`, or hit `/api/...` directly to verify. |
| 500 from `/api/predict` | Most often a model/feature mismatch after retraining. Confirm `m["features"]` matches what's in the inference dataframe. |

---

## 17. What to Show, What to Hide

A portfolio project is a curated artifact. Some choices:

**Make it loud:** the live URL, the architecture diagram, the GitHub Actions badges (CI passing, last ingest, last retrain), the realised vs predicted error chart.

**Make it quiet:** the model is simple, the dataset is small. Don't claim production-grade. If asked, you've built a credible MVP that demonstrates the lifecycle, and you can describe what production would require.

---

End of guide. Build incrementally, deploy after each phase, and don't optimise anything you haven't measured.
