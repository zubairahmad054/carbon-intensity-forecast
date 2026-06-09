"""Compute marginal carbon intensity and write it to Neon.

Two outputs, both into the `marginal_intensity` table:

  1. HISTORICAL (method='merit-order') — for every half-hour we have a generation
     mix, attribute the marginal kWh to the most-expensive dispatched fuel and use
     its official carbon factor. This is the realised marginal series.

  2. FORWARD  (method='forecast-map') — our 48h intensity forecast (ours-v1) tells
     us the AVERAGE intensity ahead, not the mix. We learn an empirical
     average->marginal mapping from history and apply it to the forecast, so the
     scheduler has a forward marginal signal aligned to the intensity forecast.

Run after training:  python scripts/marginal.py

NOTE: keep the factors + merit order in sync with lib/marginal.ts.
"""
from __future__ import annotations

import sys

import pandas as pd

from _shared import connect

# Official Carbon Intensity API fuel factors, gCO2/kWh (mirror of lib/marginal.ts).
FUEL_CARBON_FACTORS = {
    "gas": 394.0,
    "coal": 937.0,
    "biomass": 120.0,
    "imports": 200.0,
    "other": 300.0,
    "nuclear": 0.0,
    "wind": 0.0,
    "solar": 0.0,
    "hydro": 0.0,
}
# Most-expensive-to-run first; the marginal plant is the first one above threshold.
MERIT_ORDER = ["coal", "gas", "other", "imports", "biomass"]
SHARE_THRESHOLD = 1.0  # %
BIN_WIDTH = 25  # gCO2/kWh, for the average->marginal map


def marginal_from_mix(row: pd.Series) -> tuple[float, str | None]:
    for fuel in MERIT_ORDER:
        if float(row.get(fuel) or 0) >= SHARE_THRESHOLD:
            return FUEL_CARBON_FACTORS[fuel], fuel
    return 0.0, None


def load_mix(conn) -> pd.DataFrame:
    cur = conn.cursor()
    cur.execute(
        "SELECT timestamp, gas, coal, nuclear, wind, solar, hydro, biomass, imports, other "
        "FROM generation_mix ORDER BY timestamp"
    )
    cols = ["timestamp", "gas", "coal", "nuclear", "wind", "solar", "hydro", "biomass", "imports", "other"]
    df = pd.DataFrame(cur.fetchall(), columns=cols)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    for c in cols[1:]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    return df


def main() -> int:
    conn = connect()
    mix = load_mix(conn)
    if mix.empty:
        print("No generation_mix rows — run backfill/ingest first.")
        return 1

    # 1) Historical marginal from the real mix.
    marg = mix.apply(marginal_from_mix, axis=1, result_type="expand")
    mix["marginal_gco2"] = marg[0].astype(float)
    mix["marginal_fuel"] = marg[1]
    print(f"computed historical marginal for {len(mix)} half-hours")

    hist_rows = [
        (r.timestamp.to_pydatetime(), round(float(r.marginal_gco2), 2), r.marginal_fuel, "merit-order")
        for r in mix.itertuples()
    ]

    # 2) Empirical average->marginal map: realised marginal vs settled average intensity.
    cur = conn.cursor()
    cur.execute("SELECT timestamp, actual FROM carbon_intensity WHERE actual IS NOT NULL")
    ci = pd.DataFrame(cur.fetchall(), columns=["timestamp", "actual"])
    ci["timestamp"] = pd.to_datetime(ci["timestamp"], utc=True)
    ci["actual"] = pd.to_numeric(ci["actual"])
    joined = ci.merge(mix[["timestamp", "marginal_gco2"]], on="timestamp", how="inner")

    fwd_rows: list[tuple] = []
    if len(joined) >= 50:
        joined["bin"] = (joined["actual"] // BIN_WIDTH).astype(int)
        bin_map = joined.groupby("bin")["marginal_gco2"].mean()
        global_mean = float(joined["marginal_gco2"].mean())

        def map_marginal(avg_intensity: float) -> float:
            b = int(avg_intensity // BIN_WIDTH)
            if b in bin_map.index:
                return float(bin_map.loc[b])
            # nearest populated bin, else the global mean
            if len(bin_map):
                nearest = min(bin_map.index, key=lambda k: abs(k - b))
                return float(bin_map.loc[nearest])
            return global_mean

        cur.execute(
            "SELECT target_time, predicted_intensity FROM forecasts "
            "WHERE model_version = 'ours-v1' AND target_time >= now()"
        )
        for ts, pred in cur.fetchall():
            fwd_rows.append(
                (ts, round(map_marginal(float(pred)), 2), None, "forecast-map")
            )
        print(f"mapped forward marginal for {len(fwd_rows)} forecast half-hours")
    else:
        print("not enough joined history for a forward map yet — historical only")

    with conn:
        cur = conn.cursor()
        cur.executemany(
            """
            INSERT INTO marginal_intensity (timestamp, marginal_gco2, marginal_fuel, method)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (timestamp) DO UPDATE SET
              marginal_gco2 = EXCLUDED.marginal_gco2,
              marginal_fuel = EXCLUDED.marginal_fuel,
              method        = EXCLUDED.method,
              created_at    = now()
            """,
            hist_rows + fwd_rows,
        )

    print(f"wrote {len(hist_rows)} historical + {len(fwd_rows)} forward marginal rows to Neon")
    return 0


if __name__ == "__main__":
    sys.exit(main())
