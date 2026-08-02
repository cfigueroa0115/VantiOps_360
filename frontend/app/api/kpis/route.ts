import { NextResponse } from "next/server";
import { query } from "@/lib/server/database";
import { calculateQualityReport } from "@/lib/server/quality-service";
import {
  parseFiltersFromRequest,
  buildParameterizedWhere,
  hasActiveFilters,
  FilterValidationError,
} from "@/lib/server/query-filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    let filters;
    try {
      filters = parseFiltersFromRequest(request);
    } catch (e) {
      if (e instanceof FilterValidationError) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: e.message, details: e.errors } },
          { status: 422 }
        );
      }
      throw e;
    }

    const { clause, values } = buildParameterizedWhere(filters);

    // Main stats query
    const mainResult = await query(
      `SELECT
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
      FROM pqr_records ${clause}`,
      values
    );
    const row = mainResult[0] as Record<string, any>;

    // Top cause — append condition for non-null causa
    const causeClause = clause
      ? `${clause} AND causa IS NOT NULL`
      : "WHERE causa IS NOT NULL";
    const causeResult = await query(
      `SELECT causa, COUNT(*)::int AS cnt FROM pqr_records ${causeClause} GROUP BY causa ORDER BY cnt DESC LIMIT 1`,
      values
    );

    const total = Number(row.total_pqr) || 1;
    const mainCauseShare = causeResult.length > 0
      ? Math.round((Number((causeResult[0] as any).cnt) / total) * 1000) / 10
      : 0;

    // Quality score — from calculateQualityReport (SINGLE SOURCE OF TRUTH)
    const qualityReport = await calculateQualityReport(filters);
    const dataQualityScore = qualityReport.overallScore;

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
      dataQualityScore,
      metadata: {
        filtered: hasActiveFilters(filters),
        appliedFilters: filters,
        recordCount: Number(row.total_pqr) || 0,
        generatedAt: new Date().toISOString(),
        datasetVersion: "pqr_records_v1",
      },
    });
  } catch (error) {
    console.error("KPIs API error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch KPIs" } },
      { status: 500 }
    );
  }
}
