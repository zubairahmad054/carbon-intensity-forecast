"""Shared helpers for the Python batch pipeline (backfill, training, inference).

Reads DATABASE_URL from .env.local / .env (same file the Next.js app uses) and
connects to Neon over the standard Postgres protocol via psycopg.
"""
from __future__ import annotations

import os
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent


def load_env() -> None:
    """Populate os.environ from .env.local then .env (without overriding)."""
    for name in (".env.local", ".env"):
        f = ROOT / name
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            val = val.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), val)


def get_dsn() -> str:
    load_env()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL not set — add it to .env.local")
    return dsn


def connect() -> psycopg.Connection:
    return psycopg.connect(get_dsn())
