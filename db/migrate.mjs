#!/usr/bin/env node
/**
 * Idempotent migration runner for the Neon Postgres database.
 *
 * Applies every db/migrations/*.sql file that hasn't run yet, tracking applied
 * files in a `_migrations` table. Safe to run repeatedly and against any branch:
 *
 *   node db/migrate.mjs            # or: npm run db:migrate / pnpm db:migrate
 *
 * Point it at a branch by setting DATABASE_URL (read from .env.local, then .env).
 * To upgrade production, run the same command with production's DATABASE_URL —
 * no data export/import involved.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { neon } from "@neondatabase/serverless"

const __dirname = dirname(fileURLToPath(import.meta.url))

// --- minimal .env loader (no extra dependency) ---
function loadEnv(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val
  }
}
loadEnv(join(process.cwd(), ".env.local"))
loadEnv(join(process.cwd(), ".env"))

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).")
  process.exit(1)
}

const sql = neon(url)
const migrationsDir = join(__dirname, "migrations")

/** Split a .sql file into individual statements (strips line comments). */
function splitStatements(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
}

async function main() {
  await sql.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name       TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  )

  const appliedRows = await sql.query(`SELECT name FROM _migrations`)
  const applied = new Set(appliedRows.map((r) => r.name))

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= skip  ${file}`)
      continue
    }
    const statements = splitStatements(readFileSync(join(migrationsDir, file), "utf8"))
    console.log(`> apply ${file} (${statements.length} statements)`)
    for (const stmt of statements) {
      await sql.query(stmt)
    }
    await sql.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file])
    ran++
  }

  console.log(ran === 0 ? "Up to date — nothing to apply." : `Done — applied ${ran} migration(s).`)
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
