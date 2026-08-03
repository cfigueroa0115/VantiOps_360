/**
 * Type-safe parser for quality report API response.
 * Validates unknown input and returns a discriminated union (Result type).
 */

export type ParsedQualityReport =
  | {
      ok: true;
      data: {
        overallScore: number;
        dimensions: {
          completeness: number;
          validity: number;
          consistency: number;
          uniqueness: number;
          timeliness: number;
          domainConformity: number;
        };
      };
    }
  | { ok: false; error: string };

const DIMENSION_KEYS = [
  "completeness",
  "validity",
  "consistency",
  "uniqueness",
  "timeliness",
  "domainConformity",
] as const;

function toFiniteInRange(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

export function parseQualityReport(raw: unknown): ParsedQualityReport {
  if (raw === null || raw === undefined) {
    return { ok: false, error: "Respuesta vacía" };
  }

  if (typeof raw !== "object") {
    return { ok: false, error: "Respuesta no es un objeto válido" };
  }

  const obj = raw as Record<string, unknown>;

  // Validate overallScore
  const overallScore = toFiniteInRange(obj.overallScore);
  if (overallScore === null) {
    return { ok: false, error: "overallScore ausente o inválido" };
  }

  // Validate dimensions
  const rawDims = obj.dimensions;
  if (rawDims === null || rawDims === undefined || typeof rawDims !== "object") {
    return { ok: false, error: "dimensions ausente o inválido" };
  }

  const dims = rawDims as Record<string, unknown>;
  const parsed: Record<string, number> = {};

  for (const key of DIMENSION_KEYS) {
    const val = toFiniteInRange(dims[key]);
    if (val === null) {
      return { ok: false, error: `Dimensión "${key}" ausente o inválida` };
    }
    parsed[key] = val;
  }

  return {
    ok: true,
    data: {
      overallScore,
      dimensions: parsed as {
        completeness: number;
        validity: number;
        consistency: number;
        uniqueness: number;
        timeliness: number;
        domainConformity: number;
      },
    },
  };
}
