import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "edge";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "");

    const result = await sql`
      SELECT
        COUNT(*)::int AS total_pqr,
        COUNT(*) FILTER (WHERE estado = 'cerrado')::int AS closed_pqr,
        COUNT(*) FILTER (WHERE estado = 'en_proceso')::int AS in_process_pqr,
        ROUND(COUNT(*) FILTER (WHERE estado = 'cerrado') * 100.0 / NULLIF(COUNT(*), 0), 1) AS percentage_closed,
        ROUND(AVG(tiempo_gestion_dias)::numeric, 1) AS avg_management_time,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 1) AS median_management_time,
        ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 1) AS p90_management_time,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 1) AS p95_management_time,
        ROUND(MAX(tiempo_gestion_dias)::numeric, 1) AS max_management_time,
        COUNT(DISTINCT causa)::int AS distinct_causes_count
      FROM pqr_records
    `;

    const row = result[0];

    const causeResult = await sql`
      SELECT causa, COUNT(*)::int AS cnt
      FROM pqr_records WHERE causa IS NOT NULL
      GROUP BY causa ORDER BY cnt DESC LIMIT 1
    `;

    const total = Number(row.total_pqr) || 1;
    const mainCauseShare = causeResult.length > 0
      ? Math.round((Number(causeResult[0].cnt) / total) * 1000) / 10
      : 0;

    const qualityResult = await sql`
      SELECT ROUND(
        COUNT(*) FILTER (WHERE motivo_cierre IS NULL OR marcacion IS NULL OR empresa IS NULL)
        * 100.0 / NULLIF(COUNT(*), 0), 1
      ) AS quality_issues_pct
      FROM pqr_records
    `;

    return NextResponse.json({
      totalPqr: Number(row.total_pqr) || 0,
      closedPqr: Number(row.closed_pqr) || 0,
      inProcessPqr: Number(row.in_process_pqr) || 0,
      percentageClosed: Number(row.percentage_closed) || 0,
      avgManagementTime: Number(row.avg_management_time) || 0,
      medianManagementTime: Number(row.median_management_time) || 0,
      p90ManagementTime: Number(row.p90_management_time) || 0,
      p95ManagementTime: Number(row.p95_management_time) || 0,
      maxManagementTime: Number(row.max_management_time) || 0,
      distinctCausesCount: Number(row.distinct_causes_count) || 0,
      mainCauseSharePct: mainCauseShare,
      qualityIssuesPct: Number(qualityResult[0]?.quality_issues_pct) || 0,
      dataQualityScore: 78.5,
    });
  } catch (error) {
    console.error("KPIs API error:", error);
    return NextResponse.json({ error: "Failed to fetch KPIs" }, { status: 500 });
  }
}
