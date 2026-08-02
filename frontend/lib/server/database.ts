/**
 * Shared database client for Neon PostgreSQL.
 * Executes parameterized queries via HTTP transport.
 */

import { neon, NeonQueryFunction } from "@neondatabase/serverless";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is required. " +
      "Configure it in Vercel Project Settings or in a local .env file."
    );
  }
  return url;
}

/**
 * Execute a parameterized SQL query against Neon.
 * Uses the neon HTTP driver with proper parameterization.
 * @param text - SQL with $1, $2 placeholders
 * @param values - Parameter values (never concatenated into SQL)
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  values?: unknown[]
): Promise<T[]> {
  const sql: NeonQueryFunction<false, false> = neon(getConnectionString());
  // The neon driver's tagged template function also accepts being invoked
  // as sql(text, params) at runtime despite TypeScript types.
  // We use a type assertion here because the runtime supports it.
  const execute = sql as unknown as (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  const rows = await execute(text, values || []);
  return rows as T[];
}
