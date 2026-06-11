"""Compute marginal carbon intensity and write it to Neon.

Two outputs, both into `marginal_intensity` (PK: timestamp + method, so realised
rows and stored forecasts coexist — required for later accuracy scoring):

  1. HISTORICAL (method='merit-order') — attribute the marginal kWh to the most-
     expensive dispatched fuel and use its official carbon factor. INCREMENTAL:
     only half-hours newer than what's already stored (minus a small overlap to
     catch late-settling mix rows) are recomputed, not the whole history.

  2. FORWARD  (method='forecast-map') — an empirical average->marginal mapping
     learned from history (aggregated in SQL, not by shipping 17k rows over the
     wire) applied to the ours-v1 48h intensity forecast. All forecast-map rows
     are REPLACED each run, so stale vintages from a failed train never linger.

Run after training:  python scripts/marginal.py

Factors / merit order / threshold come from config/fuel-factors.json — the single
source of truth shared with lib/marginal.ts.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

from _shared import connect

_CONFIG = json.loads(
    (Path(__file__).resolve().parent.parent / "config" / "fuel-factors.json").read_text(
        encoding="utf-8"
    )
)
FUEL_CARBON_FACTORS: dict[str, float] = {k: float(v) for k, v in _CONFIG["factors"].items()}
MERIT_ORDER: list[str] = _CONFIG["meritOrder"]
SHARE_THRESHOLD: float = float(_CONFIG["shareThresholdPct"])

BIN_WIDTH = 25  # gCO2/kWh, for the average->marginal map
HIST_OVERLAP_DAYS = 2  # recompute this much trailing history to catch late mix rows
MIN_MAP_SAMPLES = 50


def marginal_from_mix(row: pd.Series) -> tuple[float, str | None]:
    for fuel in MERIT_ORDER:
        if float(row.get(fuel) or 0) >= SHARE_THRESHOLD:
            return FUEL_CARBON_FACTORS[fuel], fuel
    return 0.0, None


def load_new_mix(conn) -> pd.DataFrame:
    """Generation-mix rows not yet covered by stored merit-order marginal
    (plus a small overlap window), so nightly runs write ~50 rows, not ~17k."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT timestamp, gas, coal, nuclear, wind, solar, hydro, biomass, imports, other
        FROM generation_mix
        WHERE timestamp > COALESCE(
            (SELECT max(timestamp) FROM marginal_intensity WHERE method = 'merit-order'),
            '-infinity'::timestamptz
        ) - make_interval(days => %s)
        ORDER BY timestamp
        """,
        (HIST_OVERLAP_DAYS,),
    )
    cols = ["timestamp", "gas", "coal", "nuclear", "wind", "solar", "hydro", "biomass", "imports", "other"]
    df = pd.DataFrame(cur.fetchall(), columns=cols)
    if df.empty:
        return df
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    for c in cols[1:]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    return df


def build_bin_map(conn) -> tuple[dict[int, float], float, int]:
    """Average realised marginal per intensity bin, aggregated IN Postgres from the
    stored merit-order series joined to settled actuals."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT floor(o.actual / %s)::int AS bin,
               avg(m.marginal_gco2)      AS marginal,
               count(*)                  AS n
        FROM marginal_intensity m
        JOIN carbon_intensity o ON o.timestamp = m.timestamp
        WHERE m.method = 'merit-order' AND o.actual IS NOT NULL
        GROUP BY 1
        """,
        (BIN_WIDTH,),
    )
    rows = cur.fetchall()
    bin_map = {int(b): float(m) for b, m, _ in rows}
    total = sum(int(n) for _, _, n in rows)
    global_mean = (
        sum(float(m) * int(n) for _, m, n in rows) / total if total else 0.0
    )
    return bin_map, global_mean, total


def main() -> int:
    # One connection, one transaction: psycopg3 closes the connection when a
    # `with conn:` block exits, so everything (including the forecast-map
    # prune+rewrite, which must be atomic) runs inside this single scope and
    # commits together on clean exit.
    with connect() as conn:
        # 1) Historical marginal — incremental.
        mix = load_new_mix(conn)
        hist_rows: list[tuple] = []
        if not mix.empty:
            marg = mix.apply(marginal_from_mix, axis=1, result_type="expand")
            mix["marginal_gco2"] = marg[0].astype(float)
            mix["marginal_fuel"] = marg[1]
            hist_rows = [
                (r.timestamp.to_pydatetime(), round(float(r.marginal_gco2), 2), r.marginal_fuel, "merit-order")
                for r in mix.itertuples()
            ]
        print(f"historical marginal: {len(hist_rows)} new/updated half-hours")

        cur = conn.cursor()
        if hist_rows:
            cur.executemany(
                """
                INSERT INTO marginal_intensity (timestamp, marginal_gco2, marginal_fuel, method)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (timestamp, method) DO UPDATE SET
                  marginal_gco2 = EXCLUDED.marginal_gco2,
                  marginal_fuel = EXCLUDED.marginal_fuel,
                  created_at    = now()
                """,
                hist_rows,
            )

        # 2) Forward marginal — replace ALL forecast-map rows so stale vintages from
        #    a failed/skipped train run never serve. The map is learned from stored
        #    history (same transaction, so it sees the rows written above).
        bin_map, global_mean, n_samples = build_bin_map(conn)

        fwd_rows: list[tuple] = []
        if n_samples >= MIN_MAP_SAMPLES:

            def map_marginal(avg_intensity: float) -> float:
                b = int(avg_intensity // BIN_WIDTH)
                if b in bin_map:
                    return bin_map[b]
                if bin_map:
                    nearest = min(bin_map, key=lambda k: abs(k - b))
                    return bin_map[nearest]
                return global_mean

            cur.execute(
                "SELECT target_time, predicted_intensity FROM forecasts "
                "WHERE model_version = 'ours-v1' AND target_time >= now()"
            )
            fwd_rows = [
                (ts, round(map_marginal(float(pred)), 2), None, "forecast-map")
                for ts, pred in cur.fetchall()
            ]
            print(f"forward marginal: mapped {len(fwd_rows)} forecast half-hours (map n={n_samples})")
        else:
            print(f"forward marginal: skipped — only {n_samples} joined samples (<{MIN_MAP_SAMPLES})")

        # Prune first: forecast-map rows are a full snapshot of the CURRENT forecast
        # horizon; anything left over is a stale vintage and must not serve.
        cur.execute("DELETE FROM marginal_intensity WHERE method = 'forecast-map'")
        if fwd_rows:
            cur.executemany(
                """
                INSERT INTO marginal_intensity (timestamp, marginal_gco2, marginal_fuel, method)
                VALUES (%s, %s, %s, %s)
                """,
                fwd_rows,
            )

        print(f"wrote {len(hist_rows)} historical + {len(fwd_rows)} forward marginal rows to Neon")
    return 0


if __name__ == "__main__":
    sys.exit(main())
