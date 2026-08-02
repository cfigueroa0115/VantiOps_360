import { NextResponse } from "next/server";
import { query } from "@/lib/server/database";
import {
  parseFiltersFromRequest,
  buildParameterizedWhere,
  hasActiveFilters,
  FilterValidationError,
} from "@/lib/server/query-filters";

const VALID_CHART_TYPES = [
  "pareto", "top_causes", "cancellation_donut",
  "distribution_company", "distribution_channel", "distribution_result",
  "temporal_trend", "p90_by_cause", "open_cases_histogram",
] as const;

type ChartType = typeof VALID_CHART_TYPES[number];

export async function GET(
  request: Request,
  { params }: { params: { chartType: string } }
) {
  const chartType = params.chartType;

  // Validate chart type
  if (!VALID_CHART_TYPES.includes(chartType as ChartType)) {
    return NextResponse.json(
      { error: { code: "INVALID_CHART_TYPE", message: `Unknown chart type: '${chartType}'. Valid types: ${VALID_CHART_TYPES.join(", ")}` } },
      { status: 404 }
    );
  }

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
    const data = await getChartData(chartType as ChartType, clause, values);

    // Filtered record count
    const countResult = await query(`SELECT COUNT(*)::int AS cnt FROM pqr_records ${clause}`, values);
    const recordCount = Number((countResult[0] as any)?.cnt) || 0;

    return NextResponse.json({
      chartType,
      data,
      metadata: {
        filtered: hasActiveFilters(filters),
        appliedFilters: filters,
        recordCount,
        generatedAt: new Date().toISOString(),
        datasetVersion: "pqr_records_v1",
      },
    });
  } catch (error) {
    console.error(`Chart API error (${chartType}):`, error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: `Failed to fetch chart data: ${chartType}` } },
      { status: 500 }
    );
  }
}

function addCondition(clause: string, extra: string): string {
  return clause ? `${clause} AND ${extra}` : `WHERE ${extra}`;
}

async function getChartData(chartType: ChartType, clause: string, values: unknown[]) {
  switch (chartType) {
    case "pareto": {
      const w = addCondition(clause, "causa IS NOT NULL");
      return query(
        `WITH counts AS (
          SELECT causa, COUNT(*)::int AS count FROM pqr_records ${w}
          GROUP BY causa HAVING COUNT(*) >= 5 ORDER BY count DESC
        ), total AS (SELECT SUM(count) AS total FROM counts)
        SELECT causa, count,
          ROUND(count * 100.0 / total.total, 2) AS percentage,
          ROUND(SUM(count) OVER (ORDER BY count DESC) * 100.0 / total.total, 2) AS cumulative_pct
        FROM counts, total ORDER BY count DESC`, values);
    }
    case "top_causes": {
      const w = addCondition(clause, "causa IS NOT NULL");
      return query(
        `SELECT causa, COUNT(*)::int AS count FROM pqr_records ${w}
         GROUP BY causa HAVING COUNT(*) >= 5 ORDER BY count DESC LIMIT 10`, values);
    }
    case "cancellation_donut": {
      const w = addCondition(clause, "causa IS NOT NULL");
      return query(
        `WITH ranked AS (SELECT causa, COUNT(*)::int AS count FROM pqr_records ${w} GROUP BY causa ORDER BY count DESC),
         total AS (SELECT SUM(count) AS total FROM ranked),
         top_c AS (SELECT causa, count FROM ranked LIMIT 1)
         SELECT top_c.causa AS category, top_c.count, ROUND(top_c.count * 100.0 / total.total, 2) AS percentage FROM top_c, total
         UNION ALL
         SELECT 'Otras causas', (total.total - top_c.count)::int, ROUND((total.total - top_c.count) * 100.0 / total.total, 2) FROM top_c, total`, values);
    }
    case "distribution_company": {
      const w = addCondition(clause, "empresa IS NOT NULL");
      return query(`SELECT empresa AS category, COUNT(*)::int AS count FROM pqr_records ${w} GROUP BY empresa HAVING COUNT(*) >= 5 ORDER BY count DESC`, values);
    }
    case "distribution_channel": {
      const w = addCondition(clause, "canal_atencion IS NOT NULL");
      return query(`SELECT canal_atencion AS category, COUNT(*)::int AS count FROM pqr_records ${w} GROUP BY canal_atencion HAVING COUNT(*) >= 5 ORDER BY count DESC`, values);
    }
    case "distribution_result": {
      const w = addCondition(clause, "resultado IS NOT NULL");
      return query(`SELECT resultado AS category, COUNT(*)::int AS count FROM pqr_records ${w} GROUP BY resultado HAVING COUNT(*) >= 5 ORDER BY count DESC`, values);
    }
    case "temporal_trend": {
      const w = addCondition(clause, "fecha_creacion IS NOT NULL");
      return query(`SELECT TO_CHAR(fecha_creacion, 'YYYY-MM') AS period, COUNT(*)::int AS count FROM pqr_records ${w} GROUP BY period HAVING COUNT(*) >= 5 ORDER BY period`, values);
    }
    case "p90_by_cause": {
      const w = addCondition(clause, "tiempo_gestion_dias IS NOT NULL AND causa IS NOT NULL");
      return query(`SELECT causa, ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 2) AS p90, COUNT(*)::int AS count FROM pqr_records ${w} GROUP BY causa HAVING COUNT(*) >= 5 ORDER BY p90 DESC LIMIT 10`, values);
    }
    case "open_cases_histogram": {
      const w = addCondition(clause, "estado != 'cerrado' AND tiempo_gestion_dias IS NOT NULL");
      return query(`SELECT CASE WHEN tiempo_gestion_dias <= 7 THEN '0-7' WHEN tiempo_gestion_dias <= 14 THEN '8-14' WHEN tiempo_gestion_dias <= 21 THEN '15-21' WHEN tiempo_gestion_dias <= 28 THEN '22-28' WHEN tiempo_gestion_dias <= 60 THEN '29-60' ELSE '61+' END AS bucket, COUNT(*)::int AS count FROM pqr_records ${w} GROUP BY bucket HAVING COUNT(*) >= 5 ORDER BY MIN(tiempo_gestion_dias)`, values);
    }
  }
}
