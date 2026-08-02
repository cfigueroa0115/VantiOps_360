/**
 * Server-side filter parsing and SQL generation for Neon queries.
 * Uses value escaping to prevent SQL injection.
 */

export interface AnalyticsFilters {
  dateStart?: string;
  dateEnd?: string;
  companies?: string[];
  causes?: string[];
  channels?: string[];
  statuses?: string[];
  results?: string[];
  responsibleUnits?: string[];
  timeMin?: number;
  timeMax?: number;
}

/**
 * Parse filter query params from a Request URL.
 * Validates inputs and rejects invalid values.
 */
export function parseFiltersFromRequest(request: Request): AnalyticsFilters {
  const { searchParams } = new URL(request.url);

  return {
    dateStart: validateDate(searchParams.get("date_start")),
    dateEnd: validateDate(searchParams.get("date_end")),
    companies: parseCSV(searchParams.get("companies")),
    causes: parseCSV(searchParams.get("causes")),
    channels: parseCSV(searchParams.get("channels")),
    statuses: parseCSV(searchParams.get("statuses")),
    results: parseCSV(searchParams.get("results")),
    responsibleUnits: parseCSV(searchParams.get("responsible_units")),
    timeMin: parseNumber(searchParams.get("time_min")),
    timeMax: parseNumber(searchParams.get("time_max")),
  };
}

/**
 * Build a SQL WHERE clause string from parsed filters.
 * Values are escaped to prevent injection. Arrays use IN(...) syntax.
 * Returns empty string if no filters active.
 */
export function buildWhereClause(filters: AnalyticsFilters): string {
  const conditions: string[] = [];

  if (filters.dateStart) {
    conditions.push(`fecha_creacion >= '${escapeValue(filters.dateStart)}'`);
  }
  if (filters.dateEnd) {
    conditions.push(`fecha_creacion <= '${escapeValue(filters.dateEnd)}'`);
  }
  if (filters.companies?.length) {
    conditions.push(`empresa IN (${filters.companies.map(v => `'${escapeValue(v)}'`).join(",")})`);
  }
  if (filters.causes?.length) {
    conditions.push(`causa IN (${filters.causes.map(v => `'${escapeValue(v)}'`).join(",")})`);
  }
  if (filters.channels?.length) {
    conditions.push(`canal_atencion IN (${filters.channels.map(v => `'${escapeValue(v)}'`).join(",")})`);
  }
  if (filters.statuses?.length) {
    conditions.push(`estado IN (${filters.statuses.map(v => `'${escapeValue(v)}'`).join(",")})`);
  }
  if (filters.results?.length) {
    conditions.push(`resultado IN (${filters.results.map(v => `'${escapeValue(v)}'`).join(",")})`);
  }
  if (filters.responsibleUnits?.length) {
    conditions.push(`unidad_responsable IN (${filters.responsibleUnits.map(v => `'${escapeValue(v)}'`).join(",")})`);
  }
  if (filters.timeMin !== undefined) {
    conditions.push(`tiempo_gestion_dias >= ${filters.timeMin}`);
  }
  if (filters.timeMax !== undefined) {
    conditions.push(`tiempo_gestion_dias <= ${filters.timeMax}`);
  }

  if (conditions.length === 0) return "";
  return "WHERE " + conditions.join(" AND ");
}

/** Check if any filters are active */
export function hasActiveFilters(filters: AnalyticsFilters): boolean {
  return !!(
    filters.dateStart || filters.dateEnd || filters.companies?.length ||
    filters.causes?.length || filters.channels?.length || filters.statuses?.length ||
    filters.results?.length || filters.responsibleUnits?.length ||
    filters.timeMin !== undefined || filters.timeMax !== undefined
  );
}

/**
 * Execute a dynamic SQL query against Neon.
 * Uses the neon() function with type assertion to pass raw SQL strings.
 * This is needed because tagged templates don't support dynamic SQL fragments.
 */
export async function queryNeon(sql: any, query: string): Promise<Record<string, any>[]> {
  // The neon() function at runtime accepts a plain string argument.
  // TypeScript types only expose the tagged template signature, so we assert.
  return await (sql as unknown as (query: string) => Promise<Record<string, any>[]>)(query);
}

// --- Helpers ---

function parseCSV(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(",").map(v => v.trim()).filter(Boolean);
  if (items.length === 0) return undefined;
  if (items.length > 100) return items.slice(0, 100);
  return items;
}

function validateDate(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  if (isNaN(num) || num < 0) return undefined;
  return num;
}

function escapeValue(value: string): string {
  return value.replace(/'/g, "''");
}
