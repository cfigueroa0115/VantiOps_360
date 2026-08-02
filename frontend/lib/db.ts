/**
 * Neon serverless database connection for Vercel Edge/Serverless functions.
 * Uses @neondatabase/serverless for HTTP-based SQL queries.
 */

import { neon } from "@neondatabase/serverless";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL or NEON_DATABASE_URL environment variable is required. " +
      "Set it in Vercel project settings."
    );
  }
  return url;
}

/** SQL tagged template function connected to Neon PostgreSQL */
export const sql = neon(getDatabaseUrl());
