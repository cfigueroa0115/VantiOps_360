import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  parseFiltersFromRequest,
  buildWhereClause,
  hasActiveFilters,
  queryNeon,
} from "@/lib/server/query-filters";

// Using Node.js runtime for Pool support

export async function GET(request: Request) {
  try {
    const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "");
    const filters = parseFiltersFromRequest(request);
    const where = buildWhereClause(filters);

    // Completeness per key field
    const completenessQuery = `
      SELECT
        COUNT(*)::int AS total_records,
        ROUND((1.0 - COUNT(*) FILTER (WHERE causa IS NULL)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) AS causa_pct,
        ROUND((1.0 - COUNT(*) FILTER (WHERE empresa IS NULL)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) AS empresa_pct,
        ROUND((1.0 - COUNT(*) FILTER (WHERE motivo_cierre IS NULL)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) AS motivo_pct,
        ROUND((1.0 - COUNT(*) FILTER (WHERE marcacion IS NULL)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) AS marcacion_pct,
        ROUND((1.0 - COUNT(*) FILTER (WHERE canal_atencion IS NULL)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) AS canal_pct
      FROM pqr_records
      ${where}
    `;
    const result = await queryNeon(sql, completenessQuery);
    const row = result[0];

    const completeness = Math.round(
      ((Number(row.causa_pct) + Number(row.empresa_pct) + Number(row.motivo_pct) +
        Number(row.marcacion_pct) + Number(row.canal_pct)) / 5) * 100
    ) / 100;

    // Validity: check fecha_creacion is valid and tiempo_gestion_dias >= 0
    const validityQuery = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE fecha_creacion IS NOT NULL
            AND tiempo_gestion_dias IS NOT NULL
            AND tiempo_gestion_dias >= 0
        )::int AS valid_records
      FROM pqr_records
      ${where}
    `;
    const validityResult = await queryNeon(sql, validityQuery);
    const validityRow = validityResult[0];
    const validityTotal = Number(validityRow.total) || 1;
    const validity = Math.round((Number(validityRow.valid_records) / validityTotal) * 10000) / 100;

    // Uniqueness: check for duplicate radicado numbers
    const uniquenessQuery = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT radicado)::int AS distinct_radicados
      FROM pqr_records
      ${where}
    `;
    const uniquenessResult = await queryNeon(sql, uniquenessQuery);
    const uniqRow = uniquenessResult[0];
    const uniqTotal = Number(uniqRow.total) || 1;
    const uniqueness = Math.round((Number(uniqRow.distinct_radicados) / uniqTotal) * 10000) / 100;

    // Consistency: check estado/resultado match expected patterns
    const consistencyQuery = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE estado IN ('cerrado', 'en_tramite', 'en_proceso', 'abierto')
        )::int AS consistent_estado,
        COUNT(*) FILTER (
          WHERE resultado IS NULL OR resultado != ''
        )::int AS consistent_resultado
      FROM pqr_records
      ${where}
    `;
    const consistencyResult = await queryNeon(sql, consistencyQuery);
    const consRow = consistencyResult[0];
    const consTotal = Number(consRow.total) || 1;
    const consistency = Math.round(
      ((Number(consRow.consistent_estado) + Number(consRow.consistent_resultado)) / (2 * consTotal)) * 10000
    ) / 100;

    // Timeliness: records created within last 365 days vs total
    const timelinessQuery = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '365 days'
        )::int AS recent_records
      FROM pqr_records
      ${where}
    `;
    const timelinessResult = await queryNeon(sql, timelinessQuery);
    const timeRow = timelinessResult[0];
    const timeTotal = Number(timeRow.total) || 1;
    const timeliness = Math.round((Number(timeRow.recent_records) / timeTotal) * 10000) / 100;

    // Referential integrity: empresa and unidad_responsable are non-empty when present
    const refQuery = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE (empresa IS NOT NULL AND empresa != '')
            AND (unidad_responsable IS NOT NULL AND unidad_responsable != '')
        )::int AS ref_ok
      FROM pqr_records
      ${where}
    `;
    const refResult = await queryNeon(sql, refQuery);
    const refRow = refResult[0];
    const refTotal = Number(refRow.total) || 1;
    const referentialIntegrity = Math.round((Number(refRow.ref_ok) / refTotal) * 10000) / 100;

    // Composite score with weighted dimensions
    const composite = Math.round(
      (0.25 * completeness + 0.20 * validity + 0.20 * consistency +
       0.15 * uniqueness + 0.10 * timeliness + 0.10 * referentialIntegrity) * 100
    ) / 100;

    return NextResponse.json({
      overallScore: composite,
      dimensions: {
        completeness,
        validity,
        consistency,
        uniqueness,
        timeliness,
        referentialIntegrity,
      },
      violations: [],
      metadata: {
        filtered: hasActiveFilters(filters),
        appliedFilters: filters,
        generatedAt: new Date().toISOString(),
        recordCount: Number(row.total_records),
      },
    });
  } catch (error) {
    console.error("Quality API error:", error);
    return NextResponse.json({ error: "Failed to fetch quality report" }, { status: 500 });
  }
}
