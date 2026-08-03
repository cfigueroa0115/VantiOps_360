/**
 * Server-side filter parsing and parameterized SQL generation.
 * ALL user values are passed as parameters ($1, $2, etc.) — NEVER concatenated.
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

export interface ParameterizedWhere {
  clause: string;       // e.g. "WHERE empresa = ANY($1::text[]) AND ..."
  values: unknown[];    // parameter values in order
}

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Parse and validate filter query params from a Request URL.
 * Returns filters or throws with validation errors.
 */
export function parseFiltersFromRequest(request: Request): AnalyticsFilters {
  const { searchParams } = new URL(request.url);
  const errors: ValidationError[] = [];

  const dateStart = searchParams.get("date_start") || undefined;
  const dateEnd = searchParams.get("date_end") || undefined;
  const timeMinStr = searchParams.get("time_min");
  const timeMaxStr = searchParams.get("time_max");

  // Validate dates
  if (dateStart && !/^\d{4}-\d{2}-\d{2}$/.test(dateStart)) {
    errors.push({ field: "date_start", message: "Invalid date format. Use YYYY-MM-DD." });
  }
  if (dateEnd && !/^\d{4}-\d{2}-\d{2}$/.test(dateEnd)) {
    errors.push({ field: "date_end", message: "Invalid date format. Use YYYY-MM-DD." });
  }
  if (dateStart && dateEnd && dateStart > dateEnd) {
    errors.push({ field: "date_start", message: "date_start must be <= date_end." });
  }

  // Validate numbers
  let timeMin: number | undefined;
  let timeMax: number | undefined;
  if (timeMinStr) {
    timeMin = Number(timeMinStr);
    if (isNaN(timeMin) || timeMin < 0) {
      errors.push({ field: "time_min", message: "Must be a non-negative number." });
    }
  }
  if (timeMaxStr) {
    timeMax = Number(timeMaxStr);
    if (isNaN(timeMax) || timeMax < 0) {
      errors.push({ field: "time_max", message: "Must be a non-negative number." });
    }
  }
  if (timeMin !== undefined && timeMax !== undefined && timeMin > timeMax) {
    errors.push({ field: "time_min", message: "time_min must be <= time_max." });
  }

  // Parse arrays using repeated params (getAll)
  const companies = getArrayParam(searchParams, "companies");
  const causes = getArrayParam(searchParams, "causes");
  const channels = getArrayParam(searchParams, "channels");
  const statuses = getArrayParam(searchParams, "statuses");
  const results = getArrayParam(searchParams, "results");
  const responsibleUnits = getArrayParam(searchParams, "responsible_units");

  // Validate array sizes
  for (const [name, arr] of Object.entries({ companies, causes, channels, statuses, results, responsibleUnits })) {
    if (arr && arr.length > 100) {
      errors.push({ field: name, message: "Maximum 100 values allowed per filter." });
    }
  }

  if (errors.length > 0) {
    throw new FilterValidationError(errors);
  }

  return {
    dateStart,
    dateEnd,
    companies: companies || undefined,
    causes: causes || undefined,
    channels: channels || undefined,
    statuses: statuses || undefined,
    results: results || undefined,
    responsibleUnits: responsibleUnits || undefined,
    timeMin,
    timeMax,
  };
}

/**
 * Build a parameterized WHERE clause from filters.
 * Returns { clause, values } where clause uses $N placeholders.
 */
export function buildParameterizedWhere(filters: AnalyticsFilters): ParameterizedWhere {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.dateStart) {
    values.push(filters.dateStart);
    conditions.push(`fecha_creacion >= $${values.length}::date`);
  }
  if (filters.dateEnd) {
    values.push(filters.dateEnd);
    conditions.push(`fecha_creacion <= $${values.length}::date`);
  }
  if (filters.companies?.length) {
    values.push(filters.companies);
    conditions.push(`empresa = ANY($${values.length}::text[])`);
  }
  if (filters.causes?.length) {
    values.push(filters.causes);
    conditions.push(`causa = ANY($${values.length}::text[])`);
  }
  if (filters.channels?.length) {
    values.push(filters.channels);
    conditions.push(`canal_atencion = ANY($${values.length}::text[])`);
  }
  if (filters.statuses?.length) {
    values.push(filters.statuses);
    conditions.push(`estado = ANY($${values.length}::text[])`);
  }
  if (filters.results?.length) {
    values.push(filters.results);
    conditions.push(`resultado = ANY($${values.length}::text[])`);
  }
  if (filters.responsibleUnits?.length) {
    values.push(filters.responsibleUnits);
    conditions.push(`unidad_responsable = ANY($${values.length}::text[])`);
  }
  if (filters.timeMin !== undefined) {
    values.push(filters.timeMin);
    conditions.push(`tiempo_gestion_dias >= $${values.length}`);
  }
  if (filters.timeMax !== undefined) {
    values.push(filters.timeMax);
    conditions.push(`tiempo_gestion_dias <= $${values.length}`);
  }

  if (conditions.length === 0) {
    return { clause: "", values: [] };
  }

  return {
    clause: "WHERE " + conditions.join(" AND "),
    values,
  };
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

/** Validation error class for filter parsing */
export class FilterValidationError extends Error {
  public readonly errors: ValidationError[];
  constructor(errors: ValidationError[]) {
    super(`Filter validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join("; ")}`);
    this.errors = errors;
    this.name = "FilterValidationError";
  }
}

// --- Helpers ---

function getArrayParam(params: URLSearchParams, key: string): string[] | null {
  const values = params.getAll(key).map(v => v.trim()).filter(Boolean);
  // Also support comma-separated for backward compatibility
  const csvValue = params.get(key);
  if (values.length === 0 && csvValue) {
    const items = csvValue.split(",").map(v => v.trim()).filter(Boolean);
    return items.length > 0 ? items : null;
  }
  return values.length > 0 ? values : null;
}

function validateDate(value: string | null): string | undefined {
  if (!value) return undefined;
  // Check format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  // Check it's a real calendar date
  const d = new Date(value + "T00:00:00Z");
  if (isNaN(d.getTime())) return undefined;
  // Verify the date components match (catches Feb 30, etc.)
  const [y, m, day] = value.split("-").map(Number);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m || d.getUTCDate() !== day) {
    return undefined;
  }
  return value;
}
