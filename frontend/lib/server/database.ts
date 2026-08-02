/**
 * Shared database client for Neon PostgreSQL.
 * Uses Pool with WebSocket for parameterized queries.
 * No eval(), no silent catches — explicit error handling.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Configure WebSocket for Node.js runtime (required by Neon Pool)
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
    pool = new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

/**
 * Execute a parameterized SQL query.
 * @param text - SQL with $1, $2 placeholders
 * @param values - Parameter values (NEVER concatenated into SQL)
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  values?: unknown[]
): Promise<T[]> {
  const p = getPool();
  const result = await p.query(text, values);
  return result.rows as T[];
}
