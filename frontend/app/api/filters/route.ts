import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// Using Node.js runtime for Pool support

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "");

    const result = await sql`
      SELECT
        ARRAY_AGG(DISTINCT empresa ORDER BY empresa) FILTER (WHERE empresa IS NOT NULL) AS companies,
        ARRAY_AGG(DISTINCT causa ORDER BY causa) FILTER (WHERE causa IS NOT NULL) AS causes,
        ARRAY_AGG(DISTINCT canal_atencion ORDER BY canal_atencion) FILTER (WHERE canal_atencion IS NOT NULL) AS channels,
        ARRAY_AGG(DISTINCT estado ORDER BY estado) FILTER (WHERE estado IS NOT NULL) AS statuses,
        ARRAY_AGG(DISTINCT resultado ORDER BY resultado) FILTER (WHERE resultado IS NOT NULL) AS results,
        ARRAY_AGG(DISTINCT unidad_responsable ORDER BY unidad_responsable) FILTER (WHERE unidad_responsable IS NOT NULL) AS responsible_units,
        COALESCE(MAX(tiempo_gestion_dias), 0) AS management_time_max
      FROM pqr_records
    `;

    const row = result[0];
    return NextResponse.json({
      companies: row.companies || [],
      causes: row.causes || [],
      channels: row.channels || [],
      statuses: row.statuses || [],
      results: row.results || [],
      responsibleUnits: row.responsible_units || [],
      managementTimeMax: Number(row.management_time_max) || 0,
    });
  } catch (error) {
    console.error("Filters API error:", error);
    return NextResponse.json({ error: "Failed to fetch filter options" }, { status: 500 });
  }
}
