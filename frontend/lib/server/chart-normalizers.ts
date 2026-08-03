/**
 * Normalize PostgreSQL query results to ensure numeric types.
 * ROUND() in PostgreSQL returns strings — we convert them to numbers here.
 */

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function normalizeParetoRows(rows: Record<string, unknown>[]): Array<{
  causa: string;
  count: number;
  percentage: number;
  cumulative_pct: number;
}> {
  return rows.map(r => ({
    causa: String(r.causa || ""),
    count: toNumber(r.count),
    percentage: toNumber(r.percentage),
    cumulative_pct: toNumber(r.cumulative_pct),
  }));
}

export function normalizeTopCauseRows(rows: Record<string, unknown>[]): Array<{
  causa: string;
  count: number;
}> {
  return rows.map(r => ({
    causa: String(r.causa || ""),
    count: toNumber(r.count),
  }));
}

export function normalizeCancellationRows(rows: Record<string, unknown>[]): Array<{
  category: string;
  count: number;
  percentage: number;
}> {
  return rows.map(r => ({
    category: String(r.category || ""),
    count: toNumber(r.count),
    percentage: toNumber(r.percentage),
  }));
}

export function normalizeDistributionRows(rows: Record<string, unknown>[]): Array<{
  category: string;
  count: number;
}> {
  return rows.map(r => ({
    category: String(r.category || ""),
    count: toNumber(r.count),
  }));
}

export function normalizeTemporalRows(rows: Record<string, unknown>[]): Array<{
  period: string;
  count: number;
}> {
  return rows.map(r => ({
    period: String(r.period || ""),
    count: toNumber(r.count),
  }));
}

export function normalizeP90Rows(rows: Record<string, unknown>[]): Array<{
  causa: string;
  p90: number;
  count: number;
}> {
  return rows.map(r => ({
    causa: String(r.causa || ""),
    p90: toNumber(r.p90),
    count: toNumber(r.count),
  }));
}

export function normalizeHistogramRows(rows: Record<string, unknown>[]): Array<{
  bucket: string;
  count: number;
}> {
  return rows.map(r => ({
    bucket: String(r.bucket || ""),
    count: toNumber(r.count),
  }));
}
