/**
 * Shared database client for Neon PostgreSQL.
 * Single Pool instance reused across serverless function invocations.
 * Uses parameterized queries exclusively — no string concatenation.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Required for Node.js runtime (non-edge)
neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL environment variable is required. " +
        "Configure it in Vercel Project Settings or in a local .env file."
      );
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

/**
 * Execute a parameterized SQL query.
 * @param text - SQL query with $1, $2, etc. placeholders
 * @param values - Parameter values (never concatenated into SQL)
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  values?: unknown[]
): Promise<T[]> {
  const client = getPool();
  const result = await client.query(text, values);
  return result.rows as T[];
}
