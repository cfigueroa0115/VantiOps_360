import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  parseFiltersFromRequest,
  buildWhereClause,
  hasActiveFilters,
  queryNeon,
} from "@/lib/server/query-filters";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "");
    const filters = parseFiltersFromRequest(request);
    const where = buildWhereClause(filters);

    // Main stats query
    const mainQuery = `
      SELECT
        COUNT(*)::int AS total_pqr,
        COUNT(*) FILTER (WHERE estado = 'cerrado')::int AS closed_pqr,
        COUNT(*) FILTER (WHERE estado IN ('en_tramite', 'en_proceso'))::int AS in_process_pqr,
        ROUND(COUNT(*) FILTER (WHERE estado = 'cerrado') * 100.0 / NULLIF(COUNT(*), 0), 1) AS percentage_closed,
        ROUND(AVG(tiempo_gestion_dias)::numeric, 1) AS avg_management_time,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 1) AS median_management_time,
        ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 1) AS p90_management_time,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 1) AS p95_management_time,
        ROUND(MAX(tiempo_gestion_dias)::numeric, 1) AS max_management_time,
        COUNT(DISTINCT causa)::int AS distinct_causes_count
      FROM pqr_records
      ${where}
    `;
    const result = await queryNeon(sql, mainQuery);
    const row = result[0];

    // Top cause query
    const causeQuery = `
      SELECT causa, COUNT(*)::int AS cnt
      FROM pqr_records
      ${where ? where + " AND causa IS NOT NULL" : "WHERE causa IS NOT NULL"}
      GROUP BY causa ORDER BY cnt DESC LIMIT 1
    `;
    const causeResult = await queryNeon(sql, causeQuery);

    const total = Number(row.total_pqr) || 1;
    const mainCauseShare = causeResult.length > 0
      ? Math.round((Number(causeResult[0].cnt) / total) * 1000) / 10
      : 0;

    // Quality issues query - records missing critical fields
    const qualityQuery = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE motivo_cierre IS NULL OR marcacion IS NULL OR empresa IS NULL)::int AS with_issues
      FROM pqr_records
      ${where}
    `;
    const qualityResult = await queryNeon(sql, qualityQuery);
    const qualityRow = qualityResult[0];
    const qualityTotal = Number(qualityRow.total) || 1;
    const qualityIssuesPct = Math.round(
      (Number(qualityRow.with_issues) / qualityTotal) * 1000
    ) / 10;

    // Calculate data quality score dynamically (100 - issues percentage)
    const dataQualityScore = Math.round((100 - qualityIssuesPct) * 10) / 10;

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
      qualityIssuesPct,
      dataQualityScore,
      metadata: {
        filtered: hasActiveFilters(filters),
        appliedFilters: filters,
        recordCount: Number(row.total_pqr) || 0,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("KPIs API error:", error);
    return NextResponse.json({ error: "Failed to fetch KPIs" }, { status: 500 });
  }
}
