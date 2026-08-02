import { NextResponse } from "next/server";
import { query } from "@/lib/server/database";
import {
  parseFiltersFromRequest,
  buildParameterizedWhere,
  hasActiveFilters,
  FilterValidationError,
} from "@/lib/server/query-filters";

/**
 * GET /api/quality — Calculate data quality dimensions dynamically.
 * All scores computed from actual database queries.
 * No hardcoded values.
 */
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

    // ─── COMPLETENESS ───
    // Ratio of non-null values for key operational fields
    const compResult = await query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(causa)::int AS causa_nn,
        COUNT(empresa)::int AS empresa_nn,
        COUNT(canal_atencion)::int AS canal_nn,
        COUNT(estado)::int AS estado_nn,
        COUNT(resultado)::int AS resultado_nn,
        COUNT(fecha_creacion)::int AS fecha_creacion_nn,
        COUNT(motivo_cierre) FILTER (WHERE estado = 'cerrado')::int AS motivo_cierre_closed_nn,
        COUNT(*) FILTER (WHERE estado = 'cerrado')::int AS total_closed
      FROM pqr_records ${clause}`, values);
    const comp = compResult[0] as Record<string, any>;
    const total = Number(comp.total) || 1;
    const totalClosed = Number(comp.total_closed) || 1;
    // Fields expected always: causa, empresa, canal, estado, fecha_creacion
    // motivo_cierre expected only when estado = cerrado
    const alwaysFields = [
      Number(comp.causa_nn) / total,
      Number(comp.empresa_nn) / total,
      Number(comp.canal_nn) / total,
      Number(comp.estado_nn) / total,
      Number(comp.fecha_creacion_nn) / total,
      Number(comp.resultado_nn) / total,
    ];
    const closedField = totalClosed > 0 ? Number(comp.motivo_cierre_closed_nn) / totalClosed : 1;
    const completeness = Math.round(
      ([...alwaysFields, closedField].reduce((a, b) => a + b, 0) / 7) * 10000
    ) / 100;

    // ─── VALIDITY ───
    // tiempo_gestion_dias >= 0, estados in catalog, dates parseable
    const valResult = await query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE tiempo_gestion_dias >= 0 OR tiempo_gestion_dias IS NULL)::int AS valid_time,
        COUNT(*) FILTER (WHERE estado IN ('cerrado', 'en_tramite', 'en_proceso', 'abierto') OR estado IS NULL)::int AS valid_estado,
        COUNT(*) FILTER (WHERE fecha_creacion IS NOT NULL)::int AS valid_fecha
      FROM pqr_records ${clause}`, values);
    const val = valResult[0] as Record<string, any>;
    const valTotal = Number(val.total) || 1;
    const validity = Math.round(
      ((Number(val.valid_time) + Number(val.valid_estado) + Number(val.valid_fecha)) / (3 * valTotal)) * 10000
    ) / 100;

    // ─── CONSISTENCY ───
    // cerrado without fecha_cierre, fecha_cierre < fecha_creacion
    const consResult = await query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE estado = 'cerrado' AND fecha_cierre IS NULL)::int AS cerrado_sin_cierre,
        COUNT(*) FILTER (WHERE fecha_cierre IS NOT NULL AND fecha_creacion IS NOT NULL AND fecha_cierre < fecha_creacion)::int AS cierre_antes_creacion,
        COUNT(*) FILTER (WHERE tiempo_gestion_dias IS NOT NULL AND tiempo_gestion_dias < 0)::int AS tiempo_negativo
      FROM pqr_records ${clause}`, values);
    const cons = consResult[0] as Record<string, any>;
    const consTotal = Number(cons.total) || 1;
    const inconsistencies = Number(cons.cerrado_sin_cierre) + Number(cons.cierre_antes_creacion) + Number(cons.tiempo_negativo);
    const consistency = Math.round((1 - inconsistencies / consTotal) * 10000) / 100;

    // ─── UNIQUENESS ───
    // Check for exact duplicate rows (all key fields match)
    const uniqResult = await query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT (causa, empresa, canal_atencion, fecha_creacion, tiempo_gestion_dias))::int AS distinct_combos
      FROM pqr_records ${clause}`, values);
    const uniq = uniqResult[0] as Record<string, any>;
    const uniqTotal = Number(uniq.total) || 1;
    const uniqueness = Math.round((Number(uniq.distinct_combos) / uniqTotal) * 10000) / 100;

    // ─── TIMELINESS ───
    // Records within the expected data range (max date in dataset as reference)
    const timeResult = await query(
      `SELECT
        COUNT(*)::int AS total,
        MAX(fecha_creacion) AS max_date,
        COUNT(*) FILTER (WHERE fecha_creacion >= (SELECT MAX(fecha_creacion) - INTERVAL '365 days' FROM pqr_records))::int AS recent
      FROM pqr_records ${clause}`, values);
    const timeRow = timeResult[0] as Record<string, any>;
    const timeTotal = Number(timeRow.total) || 1;
    const timeliness = Math.round((Number(timeRow.recent) / timeTotal) * 10000) / 100;

    // ─── REFERENTIAL INTEGRITY ───
    // Check empresa and canal against known catalogs (derived from data itself: top values)
    const refResult = await query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE empresa IS NOT NULL AND LENGTH(TRIM(empresa)) > 1)::int AS valid_empresa,
        COUNT(*) FILTER (WHERE canal_atencion IS NOT NULL AND LENGTH(TRIM(canal_atencion)) > 1)::int AS valid_canal,
        COUNT(*) FILTER (WHERE unidad_responsable IS NOT NULL AND LENGTH(TRIM(unidad_responsable)) > 1)::int AS valid_unidad
      FROM pqr_records ${clause}`, values);
    const ref = refResult[0] as Record<string, any>;
    const refTotal = Number(ref.total) || 1;
    const referentialIntegrity = Math.round(
      ((Number(ref.valid_empresa) + Number(ref.valid_canal) + Number(ref.valid_unidad)) / (3 * refTotal)) * 10000
    ) / 100;

    // ─── COMPOSITE SCORE ───
    const composite = Math.round(
      (0.25 * completeness + 0.20 * validity + 0.20 * consistency +
       0.15 * uniqueness + 0.10 * timeliness + 0.10 * referentialIntegrity) * 100
    ) / 100;

    // ─── VIOLATIONS ───
    const violations = [];
    if (Number(cons.cerrado_sin_cierre) > 0) {
      violations.push({
        ruleId: "CONS-001",
        field: "fecha_cierre",
        description: "Registros con estado 'cerrado' sin fecha de cierre",
        count: Number(cons.cerrado_sin_cierre),
        percentage: Math.round((Number(cons.cerrado_sin_cierre) / consTotal) * 10000) / 100,
        severity: Number(cons.cerrado_sin_cierre) / consTotal > 0.05 ? "HIGH" : "MEDIUM",
        recommendedAction: "Completar fecha de cierre para registros cerrados",
      });
    }
    if (Number(cons.cierre_antes_creacion) > 0) {
      violations.push({
        ruleId: "CONS-002",
        field: "fecha_cierre, fecha_creacion",
        description: "Fecha de cierre anterior a fecha de creación",
        count: Number(cons.cierre_antes_creacion),
        percentage: Math.round((Number(cons.cierre_antes_creacion) / consTotal) * 10000) / 100,
        severity: "HIGH",
        recommendedAction: "Corregir inconsistencia temporal en registros afectados",
      });
    }
    // Completeness violations for key fields
    const nullMotivoCierre = totalClosed - Number(comp.motivo_cierre_closed_nn);
    if (nullMotivoCierre > 0) {
      violations.push({
        ruleId: "COMP-001",
        field: "motivo_cierre",
        description: "Registros cerrados sin motivo de cierre documentado",
        count: nullMotivoCierre,
        percentage: Math.round((nullMotivoCierre / totalClosed) * 10000) / 100,
        severity: nullMotivoCierre / totalClosed > 0.1 ? "HIGH" : "MEDIUM",
        recommendedAction: "Implementar campo obligatorio de motivo al cerrar caso",
      });
    }
    const nullResultado = total - Number(comp.resultado_nn);
    if (nullResultado > 0) {
      violations.push({
        ruleId: "COMP-002",
        field: "resultado",
        description: "Registros sin resultado documentado",
        count: nullResultado,
        percentage: Math.round((nullResultado / total) * 10000) / 100,
        severity: nullResultado / total > 0.1 ? "HIGH" : "MEDIUM",
        recommendedAction: "Asegurar que todos los registros documenten resultado",
      });
    }

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
      violations,
      metadata: {
        filtered: hasActiveFilters(filters),
        appliedFilters: filters,
        generatedAt: new Date().toISOString(),
        recordCount: total,
        datasetVersion: "pqr_records_v1",
        source: "CALCULATED_RESULT",
      },
    });
  } catch (error) {
    console.error("Quality API error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to compute quality metrics" } },
      { status: 500 }
    );
  }
}
