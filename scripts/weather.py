"""Open-Meteo weather client (free, no API key).

Wind speed at 100m hub height, shortwave solar radiation and 2m temperature are
the physical drivers of GB carbon intensity (wind/solar push it down). We use a
single representative central-GB point as a simplification; a future improvement
is a demand/capacity-weighted blend of several points.
"""
from __future__ import annotations

import httpx
import pandas as pd

LAT, LON = 53.0, -1.5  # central GB (simplification)
VARS = "wind_speed_100m,shortwave_radiation,temperature_2m"


def _to_frame(hourly: dict) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "wind": hourly["wind_speed_100m"],
            "solar": hourly["shortwave_radiation"],
            "temp": hourly["temperature_2m"],
        },
        index=pd.to_datetime(hourly["time"], utc=True),
    )


def fetch_archive(start_date: str, end_date: str) -> pd.DataFrame:
    """Historical hourly weather (ERA5 reanalysis) for YYYY-MM-DD .. YYYY-MM-DD."""
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={LAT}&longitude={LON}&start_date={start_date}&end_date={end_date}"
        f"&hourly={VARS}&timezone=UTC"
    )
    with httpx.Client(timeout=60.0) as c:
        r = c.get(url)
        r.raise_for_status()
        return _to_frame(r.json()["hourly"])


def fetch_forecast(past_days: int = 7, forecast_days: int = 3) -> pd.DataFrame:
    """Recent + future hourly weather (forecast model)."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={LAT}&longitude={LON}&hourly={VARS}"
        f"&past_days={past_days}&forecast_days={forecast_days}&timezone=UTC"
    )
    with httpx.Client(timeout=60.0) as c:
        r = c.get(url)
        r.raise_for_status()
        return _to_frame(r.json()["hourly"])


def combined(start_date: str, end_date: str) -> pd.DataFrame:
    """Archive history stitched with the forecast window (forecast wins on overlap)."""
    try:
        archive = fetch_archive(start_date, end_date)
    except Exception as e:  # noqa: BLE001
        print(f"  weather archive failed ({e}); using forecast window only")
        archive = pd.DataFrame(columns=["wind", "solar", "temp"])
    fc = fetch_forecast(past_days=7, forecast_days=3)
    wx = pd.concat([archive, fc]).sort_index()
    wx = wx[~wx.index.duplicated(keep="last")]
    return wx
