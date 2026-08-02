/**
 * Quality calculation service — SINGLE SOURCE OF TRUTH.
 * Used by both /api/quality and /api/kpis to ensure consistent scores.
 */

import { query } from "./database";
import { AnalyticsFilters, buildParameterizedWhere } from "./query-filters";

export interface QualityDimension {
  score: number;
  description: string;
  methodology: string;
}

export interface QualityViolation {
  ruleId: string;
  dimension: string;
  field: string;
  description: string;
  count: number;
  percentage: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  recommendedAction: string;
}

export interface QualityReport {
  overallScore: number;
  dimensions: {
    completeness: number;
    validity: number;
    consistency: number;
    uniqueness: number;
    timeliness: number;
    domainConformity: number;
  };
  violations: QualityViolation[];
  metadata: {
    recordCount: number;
    generatedAt: string;
    datasetVersion: string;
    source: string;
    methodology: string;
  };
}

/**
 * Calculate the full quality report for the given filters.
 * This is the ONLY function that computes quality metrics.
 */
export async function calculateQualityReport(
  filters: AnalyticsFilters
): Promise<QualityReport> {
  const { clause, values } = buildParameterizedWhere(filters);
  const violations: QualityViolation[] = [];

  // Get total count
  const countResult = await query(`SELECT COUNT(*)::int AS total FROM pqr_records ${clause}`, values);
  const total = Number((countResult[0] as any).total) || 1;

  // ─── COMPLETENESS ───
  // Fields that are ALWAYS required: causa, empresa, canal_atencion, estado, fecha_creacion
  // Fields required conditionally: fecha_cierre (when cerrado), motivo_cierre (when cerrado)
  const compResult = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(causa)::int AS causa_nn,
      COUNT(empresa)::int AS empresa_nn,
      COUNT(canal_atencion)::int AS canal_nn,
      COUNT(estado)::int AS estado_nn,
      COUNT(fecha_creacion)::int AS fecha_creacion_nn,
      COUNT(resultado)::int AS resultado_nn,
      COUNT(*) FILTER (WHERE estado = 'cerrado')::int AS total_cerrado,
      COUNT(fecha_cierre) FILTER (WHERE estado = 'cerrado')::int AS cierre_cerrado_nn,
      COUNT(motivo_cierre) FILTER (WHERE estado = 'cerrado')::int AS motivo_cerrado_nn
    FROM pqr_records ${clause}
  `, values);
  const comp = compResult[0] as any;
  const totalCerrado = Number(comp.total_cerrado) || 1;

  // Always-required fields (5)
  const alwaysScores = [
    Number(comp.causa_nn) / total,
    Number(comp.empresa_nn) / total,
    Number(comp.canal_nn) / total,
    Number(comp.estado_nn) / total,
    Number(comp.fecha_creacion_nn) / total,
  ];
  // Conditional fields (2) - only for cerrado records
  const conditionalScores = [
    Number(comp.cierre_cerrado_nn) / totalCerrado,
    Number(comp.motivo_cerrado_nn) / totalCerrado,
  ];
  const allScores = [...alwaysScores, ...conditionalScores];
  const completeness = Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10000) / 100;

  // Add completeness violations
  const nullFields = [
    { field: "causa", nn: Number(comp.causa_nn), label: "Causa" },
    { field: "empresa", nn: Number(comp.empresa_nn), label: "Empresa" },
    { field: "canal_atencion", nn: Number(comp.canal_nn), label: "Canal de atención" },
    { field: "estado", nn: Number(comp.estado_nn), label: "Estado" },
    { field: "fecha_creacion", nn: Number(comp.fecha_creacion_nn), label: "Fecha de creación" },
  ];
  for (const f of nullFields) {
    const nullCount = total - f.nn;
    if (nullCount > 0) {
      violations.push({
        ruleId: `COMP-${f.field.toUpperCase()}`,
        dimension: "completeness",
        field: f.field,
        description: `${f.label} ausente`,
        count: nullCount,
        percentage: Math.round((nullCount / total) * 10000) / 100,
        severity: nullCount / total > 0.1 ? "HIGH" : nullCount / total > 0.05 ? "MEDIUM" : "LOW",
        recommendedAction: `Completar ${f.label.toLowerCase()} en registros faltantes`,
      });
    }
  }
  // Conditional completeness
  const nullMotivo = totalCerrado - Number(comp.motivo_cerrado_nn);
  if (nullMotivo > 0) {
    violations.push({
      ruleId: "COMP-MOTIVO_CIERRE",
      dimension: "completeness",
      field: "motivo_cierre",
      description: "Registros cerrados sin motivo de cierre",
      count: nullMotivo,
      percentage: Math.round((nullMotivo / totalCerrado) * 10000) / 100,
      severity: nullMotivo / totalCerrado > 0.1 ? "HIGH" : "MEDIUM",
      recommendedAction: "Implementar motivo obligatorio al cerrar",
    });
  }
  const nullCierre = totalCerrado - Number(comp.cierre_cerrado_nn);
  if (nullCierre > 0) {
    violations.push({
      ruleId: "COMP-FECHA_CIERRE",
      dimension: "completeness",
      field: "fecha_cierre",
      description: "Registros cerrados sin fecha de cierre",
      count: nullCierre,
      percentage: Math.round((nullCierre / totalCerrado) * 10000) / 100,
      severity: "HIGH",
      recommendedAction: "Registrar fecha de cierre al cambiar estado a cerrado",
    });
  }

  // ─── VALIDITY ───
  const valResult = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE tiempo_gestion_dias < 0)::int AS negative_time,
      COUNT(*) FILTER (WHERE estado NOT IN ('cerrado', 'en_tramite', 'en_proceso', 'abierto') AND estado IS NOT NULL)::int AS invalid_estado,
      COUNT(*) FILTER (WHERE fecha_creacion IS NOT NULL AND fecha_creacion > CURRENT_DATE)::int AS future_fecha
    FROM pqr_records ${clause}
  `, values);
  const val = valResult[0] as any;
  const invalidCount = Number(val.negative_time) + Number(val.invalid_estado) + Number(val.future_fecha);
  const validity = Math.round((1 - invalidCount / total) * 10000) / 100;

  if (Number(val.negative_time) > 0) {
    violations.push({
      ruleId: "VAL-TIEMPO_NEG",
      dimension: "validity",
      field: "tiempo_gestion_dias",
      description: "Tiempo de gestión negativo",
      count: Number(val.negative_time),
      percentage: Math.round((Number(val.negative_time) / total) * 10000) / 100,
      severity: "HIGH",
      recommendedAction: "Corregir cálculo de tiempo de gestión",
    });
  }
  if (Number(val.invalid_estado) > 0) {
    violations.push({
      ruleId: "VAL-ESTADO_INVALIDO",
      dimension: "validity",
      field: "estado",
      description: "Estado fuera del catálogo válido",
      count: Number(val.invalid_estado),
      percentage: Math.round((Number(val.invalid_estado) / total) * 10000) / 100,
      severity: "MEDIUM",
      recommendedAction: "Homologar estados al catálogo definido",
    });
  }

  // ─── CONSISTENCY ───
  const consResult = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE (estado = 'cerrado' AND fecha_cierre IS NULL)
           OR (fecha_cierre IS NOT NULL AND fecha_creacion IS NOT NULL AND fecha_cierre < fecha_creacion)
           OR (tiempo_gestion_dias IS NOT NULL AND tiempo_gestion_dias < 0)
      )::int AS inconsistent_rows,
      COUNT(*) FILTER (WHERE estado = 'cerrado' AND fecha_cierre IS NULL)::int AS cerrado_sin_cierre,
      COUNT(*) FILTER (WHERE fecha_cierre IS NOT NULL AND fecha_creacion IS NOT NULL AND fecha_cierre < fecha_creacion)::int AS cierre_antes
    FROM pqr_records ${clause}
  `, values);
  const cons = consResult[0] as any;
  const consistency = Math.round((1 - Number(cons.inconsistent_rows) / total) * 10000) / 100;

  if (Number(cons.cerrado_sin_cierre) > 0) {
    violations.push({
      ruleId: "CONS-CERRADO_SIN_CIERRE",
      dimension: "consistency",
      field: "fecha_cierre",
      description: "Estado cerrado sin fecha de cierre registrada",
      count: Number(cons.cerrado_sin_cierre),
      percentage: Math.round((Number(cons.cerrado_sin_cierre) / total) * 10000) / 100,
      severity: Number(cons.cerrado_sin_cierre) / total > 0.05 ? "HIGH" : "MEDIUM",
      recommendedAction: "Completar fecha de cierre para registros cerrados",
    });
  }
  if (Number(cons.cierre_antes) > 0) {
    violations.push({
      ruleId: "CONS-CIERRE_ANTES_CREACION",
      dimension: "consistency",
      field: "fecha_cierre, fecha_creacion",
      description: "Fecha de cierre anterior a fecha de creación",
      count: Number(cons.cierre_antes),
      percentage: Math.round((Number(cons.cierre_antes) / total) * 10000) / 100,
      severity: "HIGH",
      recommendedAction: "Corregir inconsistencia temporal",
    });
  }

  // ─── UNIQUENESS ───
  const uniqResult = await query(`
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(DISTINCT ROW(causa, empresa, canal_atencion, estado, resultado, fecha_creacion, tiempo_gestion_dias))::int AS distinct_hashes
    FROM pqr_records ${clause}
  `, values);
  const uniq = uniqResult[0] as any;
  const duplicateExcess = Number(uniq.total_rows) - Number(uniq.distinct_hashes);
  const uniqueness = Math.round((Number(uniq.distinct_hashes) / Number(uniq.total_rows)) * 10000) / 100;

  if (duplicateExcess > 0) {
    violations.push({
      ruleId: "UNIQ-EXACT_DUPLICATES",
      dimension: "uniqueness",
      field: "(multiple)",
      description: "Posibles registros duplicados exactos (misma combinación de campos clave)",
      count: duplicateExcess,
      percentage: Math.round((duplicateExcess / total) * 10000) / 100,
      severity: duplicateExcess / total > 0.1 ? "HIGH" : "MEDIUM",
      recommendedAction: "Investigar posibles duplicados. Limitación: no existe identificador único de la fuente original.",
    });
  }

  // ─── TIMELINESS ───
  // Measured as % of records within last 365 days of the dataset's max date (not today)
  const timeResult = await query(`
    SELECT
      COUNT(*)::int AS total,
      MAX(fecha_creacion) AS max_date,
      COUNT(*) FILTER (
        WHERE fecha_creacion >= (SELECT MAX(fecha_creacion) - INTERVAL '365 days' FROM pqr_records)
      )::int AS within_window
    FROM pqr_records ${clause}
  `, values);
  const timeRow = timeResult[0] as any;
  const timeliness = Math.round((Number(timeRow.within_window) / total) * 10000) / 100;

  // ─── DOMAIN CONFORMITY (formerly "referential integrity") ───
  // Compare values against known catalogs derived from the dataset
  // Since no external catalog exists, we validate against established domain values
  const domResult = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE empresa IS NOT NULL AND LENGTH(TRIM(empresa)) > 1)::int AS valid_empresa,
      COUNT(*) FILTER (WHERE canal_atencion IS NOT NULL AND LENGTH(TRIM(canal_atencion)) > 1)::int AS valid_canal,
      COUNT(*) FILTER (WHERE unidad_responsable IS NOT NULL AND LENGTH(TRIM(unidad_responsable)) > 1)::int AS valid_unidad,
      COUNT(*) FILTER (WHERE empresa IS NOT NULL)::int AS empresa_present,
      COUNT(*) FILTER (WHERE canal_atencion IS NOT NULL)::int AS canal_present,
      COUNT(*) FILTER (WHERE unidad_responsable IS NOT NULL)::int AS unidad_present
    FROM pqr_records ${clause}
  `, values);
  const dom = domResult[0] as any;
  const empresaPresent = Number(dom.empresa_present) || 1;
  const canalPresent = Number(dom.canal_present) || 1;
  const unidadPresent = Number(dom.unidad_present) || 1;
  const domainConformity = Math.round(
    ((Number(dom.valid_empresa) / empresaPresent +
      Number(dom.valid_canal) / canalPresent +
      Number(dom.valid_unidad) / unidadPresent) / 3) * 10000
  ) / 100;

  // ─── COMPOSITE SCORE ───
  const composite = Math.round(
    (0.25 * completeness + 0.20 * validity + 0.20 * consistency +
     0.15 * uniqueness + 0.10 * timeliness + 0.10 * domainConformity) * 100
  ) / 100;

  return {
    overallScore: composite,
    dimensions: {
      completeness,
      validity,
      consistency,
      uniqueness,
      timeliness,
      domainConformity,
    },
    violations: violations.sort((a, b) => b.count - a.count),
    metadata: {
      recordCount: total,
      generatedAt: new Date().toISOString(),
      datasetVersion: "pqr_records_v1",
      source: "CALCULATED_RESULT",
      methodology: "Weighted composite: completeness 25%, validity 20%, consistency 20%, uniqueness 15%, timeliness 10%, domain conformity 10%",
    },
  };
}
