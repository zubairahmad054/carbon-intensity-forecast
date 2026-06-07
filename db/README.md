# Database

One **Neon Postgres** database serves both local development and production. There
is no local Postgres and no local→prod export: you point at a Neon *branch* via
`DATABASE_URL`, and schema changes ship as versioned SQL migrations applied to
whichever branch you target.

## One-time setup

1. Create a free project at [neon.tech](https://neon.tech) (region: London/Frankfurt).
2. (Recommended) Create a **`dev` branch** so local work never touches prod data:
   Neon dashboard → Branches → New branch → `dev`.
3. Copy the **pooled** connection string (host contains `-pooler`).
4. `cp .env.example .env.local` and paste it into `DATABASE_URL`.
5. Apply the schema:

   ```bash
   pnpm db:migrate      # or: npm run db:migrate
   ```

That creates `carbon_intensity`, `forecasts`, `model_metrics`, and a `_migrations`
bookkeeping table.

## Going live (no data export)

In Vercel, set `DATABASE_URL` to the **production branch** string (the Neon–Vercel
integration can auto-populate this). Then run the migrations against production once:

```bash
DATABASE_URL="<prod pooled string>" pnpm db:migrate
```

The runner only applies files not already recorded in `_migrations`, so it is safe
to run repeatedly and on every branch.

## Adding schema changes

Never edit an applied migration. Add the next numbered file, e.g.
`db/migrations/002_generation_mix.sql`, then `pnpm db:migrate`. Example upcoming
features that will land this way: per-fuel generation mix, regional intensity,
and prediction intervals (`predicted_low` / `predicted_high`).

## Resetting the dev branch

In Neon, reset or delete/recreate the `dev` branch from `main`. No local state to
clear — the app holds no database other than Neon.
