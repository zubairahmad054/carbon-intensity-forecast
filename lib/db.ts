import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

let client: NeonQueryFunction<false, false> | undefined

/**
 * Returns the Neon SQL client, creating it on first use.
 *
 * The connection string is only read when a query is actually attempted —
 * importing this module never throws. That means a missing DATABASE_URL surfaces
 * inside a route's try/catch (so the route can fall back to the live NESO API or
 * demo data) instead of crashing the module at import time.
 *
 * Use this directly when you need the full client API (e.g. `.query(text, params)`
 * for batched inserts). For tagged-template queries, the `sql` export below is fine.
 */
export function getSql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.",
      )
    }
    client = neon(url)
  }
  return client
}

/**
 * Lazy tagged-template wrapper, so existing `sql`...`` call sites keep working
 * without evaluating DATABASE_URL at import time.
 */
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  getSql()(strings, ...values)) as unknown as NeonQueryFunction<false, false>
