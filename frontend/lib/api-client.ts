/**
 * Typed API client for PQR Analytics backend communication.
 * Implements retry logic with exponential backoff, timeout management,
 * and filter parameter serialization.
 */

import type {
  ChartDataResponse,
  FilterOptions,
  FilterParams,
  KPIData,
  QualityReportResponse,
  RCAFindingsResponse,
  RiskModelResponse,
} from "@/lib/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000]; // exponential backoff
const REQUEST_TIMEOUT_MS = 10_000; // 10 seconds per request (Req 5.6)

/** Typed error thrown after all retries are exhausted */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Serialize FilterParams into URLSearchParams query string.
 * Arrays are serialized as comma-separated values.
 */
export function serializeFilters(filters?: FilterParams): string {
  if (!filters) return "";

  const params = new URLSearchParams();

  if (filters.dateRange) {
    params.set("date_start", filters.dateRange.start);
    params.set("date_end", filters.dateRange.end);
  }
  if (filters.companies?.length) {
    params.set("companies", filters.companies.join(","));
  }
  if (filters.causes?.length) {
    params.set("causes", filters.causes.join(","));
  }
  if (filters.channels?.length) {
    params.set("channels", filters.channels.join(","));
  }
  if (filters.statuses?.length) {
    params.set("statuses", filters.statuses.join(","));
  }
  if (filters.results?.length) {
    params.set("results", filters.results.join(","));
  }
  if (filters.responsibleUnits?.length) {
    params.set("responsible_units", filters.responsibleUnits.join(","));
  }
  if (filters.managementTimeRange) {
    params.set("time_min", String(filters.managementTimeRange.min));
    params.set("time_max", String(filters.managementTimeRange.max));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Internal fetch wrapper with timeout and retry logic.
 * Retries up to MAX_RETRIES times with exponential backoff on network
 * errors or 5xx responses.
 */
async function fetchWithRetry<T>(endpoint: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const response = await fetch(`${BASE_URL}${endpoint}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Retry on server errors (5xx)
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        lastError = new ApiError(
          response.status,
          endpoint,
          `Server error ${response.status}`,
        );
        await delay(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      // Client errors (4xx) — do not retry
      throw new ApiError(
        response.status,
        endpoint,
        `Request failed: ${response.status} ${response.statusText}`,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Network/timeout errors — retry if attempts remain
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAYS_MS[attempt]);
        continue;
      }
    }
  }

  throw new ApiError(
    0,
    endpoint,
    `Request to ${endpoint} failed after ${MAX_RETRIES} retries: ${lastError?.message ?? "Unknown error"}`,
  );
}

/** Delay helper for exponential backoff */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API methods ───────────────────────────────────────────────────────

/** Fetch KPI data with optional filters */
export async function fetchKPIs(filters?: FilterParams): Promise<KPIData> {
  const qs = serializeFilters(filters);
  return fetchWithRetry<KPIData>(`/api/kpis${qs}`);
}

/** Fetch chart data for a specific chart type with optional filters */
export async function fetchChartData(
  chartType: string,
  filters?: FilterParams,
): Promise<ChartDataResponse> {
  const qs = serializeFilters(filters);
  return fetchWithRetry<ChartDataResponse>(`/api/charts/${chartType}${qs}`);
}

/** Fetch available filter options from the dataset */
export async function fetchFilterOptions(): Promise<FilterOptions> {
  return fetchWithRetry<FilterOptions>("/api/filters/options");
}

/** Fetch quality report metrics */
export async function fetchQualityReport(): Promise<QualityReportResponse> {
  return fetchWithRetry<QualityReportResponse>("/api/quality/report");
}

/** Fetch risk model results */
export async function fetchRiskModel(): Promise<RiskModelResponse> {
  return fetchWithRetry<RiskModelResponse>("/api/risk/model");
}

/** Fetch root cause analysis findings */
export async function fetchRCAFindings(): Promise<RCAFindingsResponse> {
  return fetchWithRetry<RCAFindingsResponse>("/api/rca/findings");
}
