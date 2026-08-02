import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: { chartType: string } }
) {
  try {
    const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "");
    const chartType = params.chartType;
    const data = await getChartData(chartType);
    const countResult = await sql`SELECT COUNT(*)::int AS cnt FROM pqr_records`;

    return NextResponse.json({
      chartType,
      data,
      metadata: {
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

async function getChartData(chartType: string) {
  const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "");

  switch (chartType) {
    case "pareto":
      return sql`WITH counts AS (SELECT causa, COUNT(*)::int AS count FROM pqr_records WHERE causa IS NOT NULL GROUP BY causa HAVING COUNT(*) >= 5 ORDER BY count DESC), total AS (SELECT SUM(count) AS total FROM counts) SELECT causa, count, ROUND(count * 100.0 / total.total, 2) AS percentage, ROUND(SUM(count) OVER (ORDER BY count DESC) * 100.0 / total.total, 2) AS cumulative_pct FROM counts, total ORDER BY count DESC`;
    case "top_causes":
      return sql`SELECT causa, COUNT(*)::int AS count FROM pqr_records WHERE causa IS NOT NULL GROUP BY causa HAVING COUNT(*) >= 5 ORDER BY count DESC LIMIT 10`;
    case "cancellation_donut":
      return sql`WITH ranked AS (SELECT causa, COUNT(*)::int AS count FROM pqr_records WHERE causa IS NOT NULL GROUP BY causa ORDER BY count DESC), total AS (SELECT SUM(count) AS total FROM ranked), top_c AS (SELECT causa, count FROM ranked LIMIT 1) SELECT top_c.causa AS category, top_c.count, ROUND(top_c.count * 100.0 / total.total, 2) AS percentage FROM top_c, total UNION ALL SELECT 'Otras causas', (total.total - top_c.count)::int, ROUND((total.total - top_c.count) * 100.0 / total.total, 2) FROM top_c, total`;
    case "distribution_company":
      return sql`SELECT empresa AS category, COUNT(*)::int AS count FROM pqr_records WHERE empresa IS NOT NULL GROUP BY empresa HAVING COUNT(*) >= 5 ORDER BY count DESC`;
    case "distribution_channel":
      return sql`SELECT canal_atencion AS category, COUNT(*)::int AS count FROM pqr_records WHERE canal_atencion IS NOT NULL GROUP BY canal_atencion HAVING COUNT(*) >= 5 ORDER BY count DESC`;
    case "distribution_result":
      return sql`SELECT resultado AS category, COUNT(*)::int AS count FROM pqr_records WHERE resultado IS NOT NULL GROUP BY resultado HAVING COUNT(*) >= 5 ORDER BY count DESC`;
    case "temporal_trend":
      return sql`SELECT TO_CHAR(fecha_creacion, 'YYYY-MM') AS period, COUNT(*)::int AS count FROM pqr_records WHERE fecha_creacion IS NOT NULL GROUP BY period HAVING COUNT(*) >= 5 ORDER BY period`;
    case "p90_by_cause":
      return sql`SELECT causa, ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 2) AS p90, COUNT(*)::int AS count FROM pqr_records WHERE tiempo_gestion_dias IS NOT NULL AND causa IS NOT NULL GROUP BY causa HAVING COUNT(*) >= 5 ORDER BY p90 DESC LIMIT 10`;
    case "open_cases_histogram":
      return sql`SELECT CASE WHEN tiempo_gestion_dias <= 7 THEN '0-7' WHEN tiempo_gestion_dias <= 14 THEN '8-14' WHEN tiempo_gestion_dias <= 21 THEN '15-21' WHEN tiempo_gestion_dias <= 28 THEN '22-28' WHEN tiempo_gestion_dias <= 60 THEN '29-60' ELSE '61+' END AS bucket, COUNT(*)::int AS count FROM pqr_records WHERE estado != 'cerrado' AND tiempo_gestion_dias IS NOT NULL GROUP BY bucket HAVING COUNT(*) >= 5 ORDER BY MIN(tiempo_gestion_dias)`;
    default:
      return [];
  }
}
