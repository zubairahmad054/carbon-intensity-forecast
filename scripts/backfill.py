"""One-off backfill of historical carbon intensity + generation mix into Neon.

Pulls from the official Carbon Intensity API in <=14-day chunks (the API's range
limit) and upserts into the same tables the live ingest writes to. This builds
enough history to train a model.

Usage:
    python scripts/backfill.py [DAYS_BACK]    # default 90
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone

import httpx

from _shared import connect

BASE = "https://api.carbonintensity.org.uk"
FUELS = ["gas", "coal", "nuclear", "wind", "solar", "hydro", "biomass", "imports", "other"]


def _fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%MZ")


def main() -> int:
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 90
    end = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(days=days)

    obs_total = 0
    gen_total = 0

    gen_cols = ", ".join(FUELS)
    gen_ph = ", ".join(["%s"] * (len(FUELS) + 1))
    gen_update = ", ".join(f"{f} = EXCLUDED.{f}" for f in FUELS)

    with httpx.Client(timeout=30.0) as client, connect() as conn:
        cur = conn.cursor()
        chunk_start = start
        while chunk_start < end:
            chunk_end = min(chunk_start + timedelta(days=13), end)
            rng = f"{_fmt(chunk_start)}/{_fmt(chunk_end)}"

            # Carbon intensity (actual + NESO forecast + index)
            try:
                r = client.get(f"{BASE}/intensity/{rng}")
                r.raise_for_status()
                rows = [
                    (
                        d["from"],
                        d["intensity"].get("actual"),
                        d["intensity"].get("forecast"),
                        d["intensity"].get("index"),
                    )
                    for d in r.json().get("data", [])
                ]
                rows = [x for x in rows if x[1] is not None or x[2] is not None]
                if rows:
                    cur.executemany(
                        """
                        INSERT INTO carbon_intensity (timestamp, actual, forecast, index)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (timestamp) DO UPDATE SET
                          actual   = COALESCE(EXCLUDED.actual, carbon_intensity.actual),
                          forecast = COALESCE(EXCLUDED.forecast, carbon_intensity.forecast),
                          index    = EXCLUDED.index
                        """,
                        rows,
                    )
                    obs_total += len(rows)
            except Exception as e:  # noqa: BLE001
                print(f"  intensity {rng} failed: {e}")

            # Generation mix
            try:
                r = client.get(f"{BASE}/generation/{rng}")
                r.raise_for_status()
                grows = []
                for d in r.json().get("data", []):
                    mix = {m["fuel"]: m["perc"] for m in d.get("generationmix", [])}
                    grows.append((d["from"], *[mix.get(f, 0) for f in FUELS]))
                if grows:
                    cur.executemany(
                        f"""
                        INSERT INTO generation_mix (timestamp, {gen_cols})
                        VALUES ({gen_ph})
                        ON CONFLICT (timestamp) DO UPDATE SET {gen_update}
                        """,
                        grows,
                    )
                    gen_total += len(grows)
            except Exception as e:  # noqa: BLE001
                print(f"  generation {rng} failed: {e}")

            conn.commit()
            print(f"{chunk_start:%Y-%m-%d} -> {chunk_end:%Y-%m-%d}  (obs={obs_total}, gen={gen_total})")
            chunk_start = chunk_end

    print(f"Done. intensity rows upserted ~{obs_total}, generation rows ~{gen_total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
