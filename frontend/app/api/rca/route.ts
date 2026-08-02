import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "edge";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "");

    const result = await sql`
      WITH counts AS (SELECT causa, COUNT(*)::int AS count FROM pqr_records WHERE causa IS NOT NULL GROUP BY causa ORDER BY count DESC),
      total AS (SELECT SUM(count) AS total FROM counts)
      SELECT causa, count, ROUND(count * 100.0 / total.total, 2) AS share_pct FROM counts, total LIMIT 1
    `;

    const mainCause = result[0]?.causa || "Unknown";
    const mainCauseShare = Number(result[0]?.share_pct) || 0;

    return NextResponse.json({
      mainCause,
      mainCauseShare,
      findings: [
        { description: `'${mainCause}' es la causa principal con ${mainCauseShare}% del volumen total`, affectedMetric: "total_pqr", severity: "high", recommendedAction: "Implementar mejoras de proceso" },
        { description: "Tiempo de gestión P90 elevado indica cuellos de botella", affectedMetric: "p90_management_time", severity: "medium", recommendedAction: "Automatizar routing y validaciones" },
      ],
      methodologies: ["Pareto", "SIPOC", "5 Whys", "Ishikawa", "Lean Waste", "FMEA", "BPMN"],
    });
  } catch (error) {
    console.error("RCA API error:", error);
    return NextResponse.json({ error: "Failed to fetch RCA findings" }, { status: 500 });
  }
}
