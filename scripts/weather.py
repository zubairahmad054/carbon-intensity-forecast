"""Open-Meteo weather client (free, no API key).

Wind speed at 100m hub height, shortwave solar radiation and 2m temperature are
the physical drivers of GB carbon intensity (wind/solar push it down). We use a
single representative central-GB point as a simplification; a future improvement
is a demand/capacity-weighted blend of several points.
"""
from __future__ import annotations

import time

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


def _get_json(url: str, attempts: int = 4, timeout: float = 60.0) -> dict:
    """GET with retry + exponential backoff. Open-Meteo occasionally drops the TLS
    connection mid-handshake (SSL UNEXPECTED_EOF); a transient blip shouldn't fail
    the whole nightly retrain, so we retry before giving up."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            with httpx.Client(timeout=timeout) as c:
                r = c.get(url)
                r.raise_for_status()
                return r.json()
        except httpx.HTTPError as e:  # covers connect/SSL/timeout/status errors
            last = e
            if i < attempts - 1:
                wait = 2**i  # 1s, 2s, 4s
                print(f"  weather request failed (attempt {i + 1}/{attempts}): {e}; retry in {wait}s")
                time.sleep(wait)
    raise last  # type: ignore[misc]


def fetch_archive(start_date: str, end_date: str) -> pd.DataFrame:
    """Historical hourly weather (ERA5 reanalysis) for YYYY-MM-DD .. YYYY-MM-DD."""
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={LAT}&longitude={LON}&start_date={start_date}&end_date={end_date}"
        f"&hourly={VARS}&timezone=UTC"
    )
    return _to_frame(_get_json(url)["hourly"])


def fetch_forecast(past_days: int = 7, forecast_days: int = 3) -> pd.DataFrame:
    """Recent + future hourly weather (forecast model)."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={LAT}&longitude={LON}&hourly={VARS}"
        f"&past_days={past_days}&forecast_days={forecast_days}&timezone=UTC"
    )
    return _to_frame(_get_json(url)["hourly"])


def combined(start_date: str, end_date: str) -> pd.DataFrame:
    """Archive history stitched with the forecast window (forecast wins on overlap).

    Each fetch retries (see _get_json) and is non-fatal on its own: a transient
    outage of one endpoint degrades gracefully to the other rather than failing the
    nightly retrain. (A simultaneous outage of both still surfaces as empty weather —
    rare enough to let the run fail loudly rather than train on no physical driver.)
    """
    try:
        archive = fetch_archive(start_date, end_date)
    except Exception as e:  # noqa: BLE001
        print(f"  weather archive failed ({e}); using forecast window only")
        archive = pd.DataFrame(columns=["wind", "solar", "temp"])
    try:
        fc = fetch_forecast(past_days=7, forecast_days=3)
    except Exception as e:  # noqa: BLE001
        print(f"  weather forecast failed ({e}); using archive history only")
        fc = pd.DataFrame(columns=["wind", "solar", "temp"])
    wx = pd.concat([archive, fc]).sort_index()
    wx = wx[~wx.index.duplicated(keep="last")]
    return wx
