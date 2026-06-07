"""Feature engineering for the carbon-intensity forecast model.

Shared by training and inference so the feature definitions can never drift.
The design uses inputs that are available for future half-hours:
  - calendar (cyclical hour/day/month)
  - weather FORECAST (wind / solar / temp) — the physical driver
  - lag_48  = intensity 24h earlier (one day)
  - lag_336 = intensity one week earlier (always settled for a <=48h horizon)

lag_48 falls in the unknown future for targets beyond 24h ahead, so inference is
done RECURSIVELY: predictions are fed forward as the lag for later steps (see
build_inference_base + the loop in train.py). Training uses true settled lags.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "month_sin",
    "month_cos",
    "is_weekend",
    "wind",
    "solar",
    "temp",
    "lag_48",
    "lag_336",
]


def _add_calendar(df: pd.DataFrame) -> pd.DataFrame:
    idx = df.index
    hour = idx.hour + idx.minute / 60.0
    dow = idx.dayofweek
    month = idx.month
    df["is_weekend"] = (dow >= 5).astype(int)
    df["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    df["dow_sin"] = np.sin(2 * np.pi * dow / 7)
    df["dow_cos"] = np.cos(2 * np.pi * dow / 7)
    df["month_sin"] = np.sin(2 * np.pi * month / 12)
    df["month_cos"] = np.cos(2 * np.pi * month / 12)
    return df


def _join_weather(df: pd.DataFrame, weather: pd.DataFrame) -> pd.DataFrame:
    w = weather.sort_index().reindex(df.index, method="ffill")
    df["wind"] = w["wind"].values
    df["solar"] = w["solar"].values
    df["temp"] = w["temp"].values
    return df


def build_training_frame(intensity: pd.DataFrame, weather: pd.DataFrame) -> pd.DataFrame:
    """intensity: half-hourly, UTC index, column 'actual'. Returns features + target."""
    df = intensity.copy()
    df = _add_calendar(df)
    df = _join_weather(df, weather)
    df["lag_48"] = df["actual"].shift(48)  # 24h = 48 half-hours
    df["lag_336"] = df["actual"].shift(336)  # 1 week = 336 half-hours
    return df[FEATURE_COLUMNS + ["actual"]].dropna()


def build_inference_base(
    future_index: pd.DatetimeIndex,
    history_actual: pd.Series,
    weather: pd.DataFrame,
) -> pd.DataFrame:
    """Static features for future half-hours (everything EXCEPT lag_48).

    lag_48 is filled recursively at predict time (train.py) because for targets
    beyond 24h ahead it falls in the future and must use the model's own earlier
    predictions. lag_336 (one week back) is always settled for a <=48h horizon.
    """
    df = pd.DataFrame(index=future_index)
    df = _add_calendar(df)
    df = _join_weather(df, weather)

    lag_idx = future_index - pd.Timedelta(hours=168)  # one week earlier
    lagged = history_actual.sort_index().reindex(
        lag_idx, method="nearest", tolerance=pd.Timedelta(minutes=30)
    )
    df["lag_336"] = lagged.values
    return df
