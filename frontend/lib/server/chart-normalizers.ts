/**
 * Normalize PostgreSQL query results to ensure numeric types.
 * ROUND() in PostgreSQL returns strings — we convert them to numbers here.
 *
 * Design: toNumber returns 0 for null/undefined (Postgres may return null for
 * empty groups). A separate warnIfInvalid logs unexpected non-numeric values
 * during development to surface data issues without crashing the API.
 */

/**
 * Convert unknown value to a finite number.
 * Returns 0 for null/undefined/NaN (safe default for Postgres edge cases).
 */
function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Strict validator — logs warning when value cannot be meaningfully converted.
 * Used in development to surface data issues from Postgres without crashing.
 */
function warnIfInvalid(value: unknown, fieldName: string, rowIndex?: number): void {
  if (value === null || value === undefined) return; // null is expected from Postgres
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return; // valid string number from ROUND()
  }
  // Anything else is unexpected
  if (process.env.NODE_ENV !== "production") {
    const loc = rowIndex !== undefined ? ` (row ${rowIndex})` : "";
    console.warn(
      `[chart-normalizers] Unexpected value for "${fieldName}"${loc}: ${JSON.stringify(value)} → defaulting to 0`
    );
  }
}

export class ChartDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartDataValidationError";
  }
}

/**
 * Strict finite number converter — THROWS on invalid data.
 * Use for client-side validation where crashing is preferable to silent zeros.
 */
export function toFiniteNumber(value: unknown, fieldName: string, rowIndex?: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  if (value === null || value === undefined) {
    // In production, fallback to 0. In dev, also log.
    if (process.env.NODE_ENV !== "production") {
      const loc = rowIndex !== undefined ? ` (row ${rowIndex})` : "";
      console.warn(`[chart-normalizers] Null/undefined for "${fieldName}"${loc} → 0`);
    }
    return 0;
  }
  const loc = rowIndex !== undefined ? ` (row ${rowIndex})` : "";
  throw new ChartDataValidationError(
    `Invalid numeric value for "${fieldName}"${loc}: ${JSON.stringify(value)}`
  );
}

export function normalizeParetoRows(rows: Record<string, unknown>[]): Array<{
  causa: string;
  count: number;
  percentage: number;
  cumulative_pct: number;
}> {
  return rows.map((r, i) => {
    warnIfInvalid(r.count, "count", i);
    warnIfInvalid(r.percentage, "percentage", i);
    warnIfInvalid(r.cumulative_pct, "cumulative_pct", i);
    return {
      causa: String(r.causa || ""),
      count: toNumber(r.count),
      percentage: toNumber(r.percentage),
      cumulative_pct: toNumber(r.cumulative_pct),
    };
  });
}

export function normalizeTopCauseRows(rows: Record<string, unknown>[]): Array<{
  causa: string;
  count: number;
}> {
  return rows.map((r, i) => {
    warnIfInvalid(r.count, "count", i);
    return {
      causa: String(r.causa || ""),
      count: toNumber(r.count),
    };
  });
}

export function normalizeCancellationRows(rows: Record<string, unknown>[]): Array<{
  category: string;
  count: number;
  percentage: number;
}> {
  return rows.map((r, i) => {
    warnIfInvalid(r.count, "count", i);
    warnIfInvalid(r.percentage, "percentage", i);
    return {
      category: String(r.category || ""),
      count: toNumber(r.count),
      percentage: toNumber(r.percentage),
    };
  });
}

export function normalizeDistributionRows(rows: Record<string, unknown>[]): Array<{
  category: string;
  count: number;
}> {
  return rows.map((r, i) => {
    warnIfInvalid(r.count, "count", i);
    return {
      category: String(r.category || ""),
      count: toNumber(r.count),
    };
  });
}

export function normalizeTemporalRows(rows: Record<string, unknown>[]): Array<{
  period: string;
  count: number;
}> {
  return rows.map((r, i) => {
    warnIfInvalid(r.count, "count", i);
    return {
      period: String(r.period || ""),
      count: toNumber(r.count),
    };
  });
}

export function normalizeP90Rows(rows: Record<string, unknown>[]): Array<{
  causa: string;
  p90: number;
  count: number;
}> {
  return rows.map((r, i) => {
    warnIfInvalid(r.p90, "p90", i);
    warnIfInvalid(r.count, "count", i);
    return {
      causa: String(r.causa || ""),
      p90: toNumber(r.p90),
      count: toNumber(r.count),
    };
  });
}

export function normalizeHistogramRows(rows: Record<string, unknown>[]): Array<{
  bucket: string;
  count: number;
}> {
  return rows.map((r, i) => {
    warnIfInvalid(r.count, "count", i);
    return {
      bucket: String(r.bucket || ""),
      count: toNumber(r.count),
    };
  });
}
