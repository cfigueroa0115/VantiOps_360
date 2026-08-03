import { NextResponse } from "next/server";
import { query } from "@/lib/server/database";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};

  // Check environment
  const hasDbUrl = !!(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
  checks.environment = hasDbUrl ? "ok" : "missing DATABASE_URL";

  // Check database connection
  try {
    const result = await query("SELECT 1 AS val");
    checks.database = result.length > 0 ? "ok" : "no response";
  } catch (e: any) {
    checks.database = `error: ${e.message?.substring(0, 80)}`;
  }

  // Check pqr_records table
  try {
    const result = await query("SELECT COUNT(*)::int AS cnt FROM pqr_records");
    const count = Number((result[0] as any).cnt);
    checks.pqrTable = count > 0 ? `ok (${count} records)` : "empty";
  } catch (e: any) {
    checks.pqrTable = `error: ${e.message?.substring(0, 80)}`;
  }

  const allOk = Object.values(checks).every(v => v.startsWith("ok"));

  return NextResponse.json({
    status: allOk ? "ready" : "not_ready",
    checks,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
