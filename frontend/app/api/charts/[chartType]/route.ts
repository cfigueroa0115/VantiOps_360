import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  parseFiltersFromRequest,
  buildWhereClause,
  hasActiveFilters,
  queryNeon,
} from "@/lib/server/query-filters";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: { chartType: string } }
) {
  try {
    const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "");
    const filters = parseFiltersFromRequest(request);
    const where = buildWhereClause(filters);
    const chartType = params.chartType;

    const data = await getChartData(sql, chartType, where);

    // Get filtered record count
    const countQuery = `SELECT COUNT(*)::int AS cnt FROM pqr_records ${where}`;
    const countResult = await queryNeon(sql, countQuery);

    return NextResponse.json({
      chartType,
      data,
      metadata: {
        filtered: hasActiveFilters(filters),
        appliedFilters: filters,
        recordCount: Number(countResult[0]?.cnt) || 0,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(`Chart API error (${params.chartType}):`, error);
    return NextResponse.json(
      { error: `Failed to fetch chart data: ${params.chartType}` },
      { status: 500 }
    );
  }
}

/**
 * Helper to combine base WHERE clause with additional conditions.
 * If where is empty, returns "WHERE <extra>".
 * If where exists, appends " AND <extra>".
 */
function addCondition(where: string, condition: string): string {
  if (!where) return `WHERE ${condition}`;
  return `${where} AND ${condition}`;
}

async function getChartData(
  sql: any,
  chartType: string,
  where: string
): Promise<Record<string, any>[]> {
  switch (chartType) {
    case "pareto": {
      const causaWhere = addCondition(where, "causa IS NOT NULL");
      const query = `
        WITH counts AS (
          SELECT causa, COUNT(*)::int AS count
          FROM pqr_records
          ${causaWhere}
          GROUP BY causa HAVING COUNT(*) >= 5
          ORDER BY count DESC
        ),
        total AS (SELECT SUM(count) AS total FROM counts)
        SELECT causa, count,
          ROUND(count * 100.0 / total.total, 2) AS percentage,
          ROUND(SUM(count) OVER (ORDER BY count DESC) * 100.0 / total.total, 2) AS cumulative_pct
        FROM counts, total
        ORDER BY count DESC
      `;
      return queryNeon(sql, query);
    }

    case "top_causes": {
      const causaWhere = addCondition(where, "causa IS NOT NULL");
      const query = `
        SELECT causa, COUNT(*)::int AS count
        FROM pqr_records
        ${causaWhere}
        GROUP BY causa HAVING COUNT(*) >= 5
        ORDER BY count DESC LIMIT 10
      `;
      return queryNeon(sql, query);
    }

    case "cancellation_donut": {
      const causaWhere = addCondition(where, "causa IS NOT NULL");
      const query = `
        WITH ranked AS (
          SELECT causa, COUNT(*)::int AS count
          FROM pqr_records
          ${causaWhere}
          GROUP BY causa ORDER BY count DESC
        ),
        total AS (SELECT SUM(count) AS total FROM ranked),
        top_c AS (SELECT causa, count FROM ranked LIMIT 1)
        SELECT top_c.causa AS category, top_c.count,
          ROUND(top_c.count * 100.0 / total.total, 2) AS percentage
        FROM top_c, total
        UNION ALL
        SELECT 'Otras causas', (total.total - top_c.count)::int,
          ROUND((total.total - top_c.count) * 100.0 / total.total, 2)
        FROM top_c, total
      `;
      return queryNeon(sql, query);
    }

    case "distribution_company": {
      const empresaWhere = addCondition(where, "empresa IS NOT NULL");
      const query = `
        SELECT empresa AS category, COUNT(*)::int AS count
        FROM pqr_records
        ${empresaWhere}
        GROUP BY empresa HAVING COUNT(*) >= 5
        ORDER BY count DESC
      `;
      return queryNeon(sql, query);
    }

    case "distribution_channel": {
      const channelWhere = addCondition(where, "canal_atencion IS NOT NULL");
      const query = `
        SELECT canal_atencion AS category, COUNT(*)::int AS count
        FROM pqr_records
        ${channelWhere}
        GROUP BY canal_atencion HAVING COUNT(*) >= 5
        ORDER BY count DESC
      `;
      return queryNeon(sql, query);
    }

    case "distribution_result": {
      const resultWhere = addCondition(where, "resultado IS NOT NULL");
      const query = `
        SELECT resultado AS category, COUNT(*)::int AS count
        FROM pqr_records
        ${resultWhere}
        GROUP BY resultado HAVING COUNT(*) >= 5
        ORDER BY count DESC
      `;
      return queryNeon(sql, query);
    }

    case "temporal_trend": {
      const dateWhere = addCondition(where, "fecha_creacion IS NOT NULL");
      const query = `
        SELECT TO_CHAR(fecha_creacion, 'YYYY-MM') AS period, COUNT(*)::int AS count
        FROM pqr_records
        ${dateWhere}
        GROUP BY period HAVING COUNT(*) >= 5
        ORDER BY period
      `;
      return queryNeon(sql, query);
    }

    case "p90_by_cause": {
      const p90Where = addCondition(where, "tiempo_gestion_dias IS NOT NULL AND causa IS NOT NULL");
      const query = `
        SELECT causa,
          ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 2) AS p90,
          COUNT(*)::int AS count
        FROM pqr_records
        ${p90Where}
        GROUP BY causa HAVING COUNT(*) >= 5
        ORDER BY p90 DESC LIMIT 10
      `;
      return queryNeon(sql, query);
    }

    case "open_cases_histogram": {
      const histWhere = addCondition(where, "estado != 'cerrado' AND tiempo_gestion_dias IS NOT NULL");
      const query = `
        SELECT
          CASE
            WHEN tiempo_gestion_dias <= 7 THEN '0-7'
            WHEN tiempo_gestion_dias <= 14 THEN '8-14'
            WHEN tiempo_gestion_dias <= 21 THEN '15-21'
            WHEN tiempo_gestion_dias <= 28 THEN '22-28'
            WHEN tiempo_gestion_dias <= 60 THEN '29-60'
            ELSE '61+'
          END AS bucket,
          COUNT(*)::int AS count
        FROM pqr_records
        ${histWhere}
        GROUP BY bucket HAVING COUNT(*) >= 5
        ORDER BY MIN(tiempo_gestion_dias)
      `;
      return queryNeon(sql, query);
    }

    default:
      return [];
  }
}
