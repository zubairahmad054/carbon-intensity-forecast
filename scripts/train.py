"""Train our forecasting model, then predict the next 48h and write both the
predictions and held-out metrics to Neon.

  python scripts/train.py

The Next.js app serves whatever is in `forecasts` / `model_metrics`, so this is
the only thing that needs to run to update the live forecast. Training and
inference happen here (batch); the web tier never runs the model.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone

import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

import features as F
import weather as W
from _shared import connect

MODEL_VERSION = "ours-v1"
HORIZON = 96  # half-hours = 48h
TEST_DAYS = 14


def load_intensity(conn) -> pd.DataFrame:
    cur = conn.cursor()
    cur.execute(
        "SELECT timestamp, actual FROM carbon_intensity WHERE actual IS NOT NULL ORDER BY timestamp"
    )
    rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=["timestamp", "actual"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["actual"] = pd.to_numeric(df["actual"])
    return df.set_index("timestamp")


def main() -> int:
    conn = connect()
    intensity = load_intensity(conn)
    print(f"loaded {len(intensity)} settled observations")
    if len(intensity) < 400:
        print("Not enough data — run `python scripts/backfill.py` first.")
        return 1

    start_date = intensity.index.min().strftime("%Y-%m-%d")
    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    wx = W.combined(start_date, end_date)
    print(f"weather rows: {len(wx)} ({wx.index.min()} .. {wx.index.max()})")

    frame = F.build_training_frame(intensity, wx)
    print(f"training rows after features: {len(frame)}")

    # Time-aware split: last TEST_DAYS as held-out.
    cutoff = frame.index.max() - pd.Timedelta(days=TEST_DAYS)
    train, test = frame[frame.index <= cutoff], frame[frame.index > cutoff]
    model = GradientBoostingRegressor(
        n_estimators=300, max_depth=4, learning_rate=0.05, random_state=42
    )
    model.fit(train[F.FEATURE_COLUMNS], train["actual"])

    pred = model.predict(test[F.FEATURE_COLUMNS])
    mae = float(mean_absolute_error(test["actual"], pred))
    rmse = float(mean_squared_error(test["actual"], pred) ** 0.5)
    r2 = float(r2_score(test["actual"], pred))
    print(f"holdout: MAE={mae:.2f}  RMSE={rmse:.2f}  R2={r2:.4f}  (n_test={len(test)})")

    # Refit on all data for the production forecast.
    model.fit(frame[F.FEATURE_COLUMNS], frame["actual"])

    last = intensity.index.max()
    future = pd.date_range(
        last + pd.Timedelta(minutes=30), periods=HORIZON, freq="30min", tz="UTC"
    )
    base = F.build_inference_base(future, intensity["actual"], wx)
    base = base.fillna(
        {
            "lag_336": float(intensity["actual"].tail(336).mean()),
            "wind": float(wx["wind"].mean()),
            "solar": 0.0,
            "temp": float(wx["temp"].mean()),
        }
    )

    # Recursive multi-step: lag_48 for far-horizon targets uses our own earlier
    # predictions (fed forward), so nothing leaks from the unknown future.
    known = intensity["actual"].astype(float).copy()
    mean48 = float(intensity["actual"].tail(48).mean())
    preds: list[float] = []
    for t in future:
        lag48_ts = t - pd.Timedelta(hours=24)
        s = known.reindex([lag48_ts], method="nearest", tolerance=pd.Timedelta(minutes=30))
        lag48 = float(s.iloc[0]) if not pd.isna(s.iloc[0]) else mean48
        row = base.loc[t]
        feat = {c: float(row[c]) for c in F.FEATURE_COLUMNS if c != "lag_48"}
        feat["lag_48"] = lag48
        X1 = pd.DataFrame([[feat[c] for c in F.FEATURE_COLUMNS]], columns=F.FEATURE_COLUMNS)
        yhat = float(model.predict(X1)[0])
        preds.append(yhat)
        known.loc[t] = yhat  # feed forward for later steps' lag_48

    with conn:
        cur = conn.cursor()
        cur.executemany(
            """
            INSERT INTO forecasts (target_time, predicted_intensity, model_version)
            VALUES (%s, %s, %s)
            ON CONFLICT (target_time, model_version)
            DO UPDATE SET predicted_intensity = EXCLUDED.predicted_intensity
            """,
            [
                (future[i].to_pydatetime(), int(round(float(preds[i]))), MODEL_VERSION)
                for i in range(len(future))
            ],
        )
        cur.execute(
            """
            INSERT INTO model_metrics
              (model_version, mae, rmse, r2_score, training_samples)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (model_version) DO UPDATE SET
              trained_at = now(),
              mae = EXCLUDED.mae,
              rmse = EXCLUDED.rmse,
              r2_score = EXCLUDED.r2_score,
              training_samples = EXCLUDED.training_samples
            """,
            (MODEL_VERSION, round(mae, 2), round(rmse, 2), round(r2, 4), len(frame)),
        )

    print(f"wrote {len(future)} predictions ({MODEL_VERSION}) + metrics to Neon")
    return 0


if __name__ == "__main__":
    sys.exit(main())
