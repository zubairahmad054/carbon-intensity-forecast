# Deployment runbook

The app is a Next.js site on **Vercel**, backed by **Neon Postgres**, kept fresh by
**GitHub Actions**. The Python model pipeline runs only in Actions (never on Vercel).

Because local and production share one Neon database, **the data you already
backfilled is live data** — production needs no re-backfill.

```
GitHub Actions ──hourly POST /api/ingest──► Vercel (Next.js) ──► Neon Postgres
              └─daily python train.py ─────────────────────────────► (writes forecast + metrics)
```

## 1. Push to GitHub

A git repo + initial commit already exist. Create an empty GitHub repo, then:

```bash
git remote add origin https://github.com/<you>/carbon-intensity-forecast.git
git push -u origin main
```

`.env.local` and `.venv/` are gitignored — no secrets or large files are pushed.

## 2. Deploy on Vercel

1. vercel.com → **Add New → Project → Import** the GitHub repo (framework auto-detects Next.js).
2. **Environment Variables** (Production + Preview):
   - `DATABASE_URL` = your Neon **pooled** connection string (the same one in `.env.local` is fine — the data is already there).
   - `INGEST_TOKEN` = a long random string (protects the ingest endpoint).
3. **Deploy.** Note the production URL, e.g. `https://carbon-intensity-forecast.vercel.app`.

> The Neon–Vercel integration can also auto-inject `DATABASE_URL` (Project → Storage → Neon).

## 3. GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `APP_URL` | the Vercel production URL (no trailing slash) |
| `INGEST_TOKEN` | same value set in Vercel |

Then Actions → run **Hourly ingest** and **Daily retrain** once via *Run workflow* to confirm they’re green. After that they run on schedule (ingest hourly, retrain 03:30 UTC).

## 4. Verify live

```bash
curl https://<your-app>.vercel.app/api/health        # if added; else:
curl https://<your-app>.vercel.app/api/intensity/current
curl https://<your-app>.vercel.app/api/forecasts      # model_version: ours-v1
```

Open the URL — gauge, generation mix, our 48h forecast, and the accuracy table should render.

## Notes

- **Schema changes**: add `db/migrations/00X_*.sql`, then run `pnpm db:migrate` with the
  production `DATABASE_URL`. No data export — migrations apply in place.
- **Dev vs prod isolation** (optional): create a Neon `dev` branch and point `.env.local`
  at it so local work never touches production rows. Swap only the connection string.
- **Storage**: a full year of half-hourly data is a few MB — far under Neon's 0.5 GB free tier.
