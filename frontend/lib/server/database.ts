/**
 * Shared database client for Neon PostgreSQL.
 * Uses Pool with WebSocket for parameterized queries in Node.js runtime.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";

// Lazy-load ws to avoid build-time issues with static generation
let wsLoaded = false;
function ensureWs() {
  if (!wsLoaded) {
    try {
      // Dynamic require to avoid static analysis during build
      const ws = eval('require')('ws');
      neonConfig.webSocketConstructor = ws;
    } catch {
      // Fallback: works without ws in some environments
    }
    wsLoaded = true;
  }
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL environment variable is required."
      );
    }
    ensureWs();
    pool = new Pool({ connectionString });
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
