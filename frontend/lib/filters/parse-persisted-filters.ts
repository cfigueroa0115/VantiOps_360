/**
 * Validates and sanitizes persisted filter state from sessionStorage.
 * Never throws. Returns validated FilterParams or empty object.
 */
import type { FilterParams } from "@/lib/types";

/** Versioned persistence format */
interface PersistedFilterStateV1 {
  version: 1;
  filters: FilterParams;
}

type ParseResult =
  | { valid: true; filters: FilterParams }
  | { valid: false; reason: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "");
}

function sanitizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.filter((item): item is string => typeof item === "string" && item !== "");
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseDateRange(value: unknown): { start: string; end: string } | undefined {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  const start = typeof obj.start === "string" && obj.start !== "" ? obj.start : undefined;
  const end = typeof obj.end === "string" && obj.end !== "" ? obj.end : undefined;
  if (!start && !end) return undefined;
  // At least one must be present
  if (start && end) return { start, end };
  if (start) return { start, end: "" };
  if (end) return { start: "", end };
  return undefined;
}

function parseManagementTimeRange(value: unknown): { min: number; max: number } | undefined {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  const min = typeof obj.min === "number" && Number.isFinite(obj.min) ? obj.min : undefined;
  const max = typeof obj.max === "number" && Number.isFinite(obj.max) ? obj.max : undefined;
  if (min === undefined || max === undefined) return undefined;
  if (min < 0) return undefined;
  if (max < min) return undefined;
  return { min, max };
}

function parseFiltersObject(obj: Record<string, unknown>): FilterParams {
  const result: FilterParams = {};

  const dateRange = parseDateRange(obj.dateRange);
  if (dateRange) result.dateRange = dateRange;

  const companies = sanitizeStringArray(obj.companies);
  if (companies) result.companies = companies;

  const causes = sanitizeStringArray(obj.causes);
  if (causes) result.causes = causes;

  const channels = sanitizeStringArray(obj.channels);
  if (channels) result.channels = channels;

  const statuses = sanitizeStringArray(obj.statuses);
  if (statuses) result.statuses = statuses;

  const results = sanitizeStringArray(obj.results);
  if (results) result.results = results;

  const responsibleUnits = sanitizeStringArray(obj.responsibleUnits);
  if (responsibleUnits) result.responsibleUnits = responsibleUnits;

  const managementTimeRange = parseManagementTimeRange(obj.managementTimeRange);
  if (managementTimeRange) result.managementTimeRange = managementTimeRange;

  return result;
}

/**
 * Parse and validate persisted filter state.
 * Accepts unknown input (from JSON.parse or any source).
 * Returns { valid: true, filters } or { valid: false, reason }.
 */
export function parsePersistedFilterState(decoded: unknown): ParseResult {
  if (decoded === null || decoded === undefined) {
    return { valid: false, reason: "null or undefined" };
  }

  if (typeof decoded !== "object" || Array.isArray(decoded)) {
    return { valid: false, reason: "not a plain object" };
  }

  const obj = decoded as Record<string, unknown>;

  // Check for versioned format
  if (obj.version === 1 && typeof obj.filters === "object" && obj.filters !== null && !Array.isArray(obj.filters)) {
    const filters = parseFiltersObject(obj.filters as Record<string, unknown>);
    return { valid: true, filters };
  }

  // Legacy format (no version field) — attempt migration
  // Only accept if it looks like a FilterParams object (has at least one known key or is empty)
  const knownKeys = ["dateRange", "companies", "causes", "channels", "statuses", "results", "responsibleUnits", "managementTimeRange"];
  const hasKnownKey = Object.keys(obj).some((k) => knownKeys.includes(k));
  const hasVersionField = "version" in obj;

  if (hasVersionField && obj.version !== 1) {
    return { valid: false, reason: "unknown version" };
  }

  if (hasKnownKey || Object.keys(obj).length === 0) {
    const filters = parseFiltersObject(obj);
    return { valid: true, filters };
  }

  return { valid: false, reason: "unrecognized structure" };
}
