import { NextResponse } from "next/server";
import { query } from "@/lib/server/database";

export async function GET() {
  try {
    const result = await query(`
      WITH counts AS (
        SELECT causa, COUNT(*)::int AS count FROM pqr_records
        WHERE causa IS NOT NULL GROUP BY causa ORDER BY count DESC
      ), total AS (SELECT SUM(count) AS total FROM counts)
      SELECT causa, count, ROUND(count * 100.0 / total.total, 2) AS share_pct
      FROM counts, total LIMIT 1
    `);

    const row = result[0] as Record<string, any>;
    const mainCause = row?.causa || "Unknown";
    const mainCauseShare = Number(row?.share_pct) || 0;

    return NextResponse.json({
      mainCause,
      mainCauseShare,
      findings: [
        {
          description: `'${mainCause}' es la causa principal con ${mainCauseShare}% del volumen total`,
          affectedMetric: "total_pqr",
          severity: "high",
          recommendedAction: "Implementar mejoras de proceso para reducción de cancelaciones",
          evidenceType: "CALCULATED_RESULT",
        },
      ],
      methodologies: ["Pareto", "SIPOC", "5 Whys", "Ishikawa", "Lean Waste", "FMEA", "BPMN"],
      metadata: {
        generatedAt: new Date().toISOString(),
        source: "CALCULATED_RESULT",
        datasetVersion: "pqr_records_v1",
      },
    });
  } catch (error) {
    console.error("RCA API error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch RCA findings" } },
      { status: 500 }
    );
  }
}
