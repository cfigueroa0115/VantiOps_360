/**
 * Typed API client for VantiOps 360.
 * All requests use RELATIVE paths (same-origin).
 * No external URLs, no NEXT_PUBLIC_API_URL.
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

// ─── Configuration ───
// Single retry for network/502/503/504 only. No retry for 4xx or 500.
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 25_000;

// ─── Endpoints (relative, same-origin) ───
export const API_ENDPOINTS = {
  kpis: "/api/kpis",
  quality: "/api/quality",
  filters: "/api/filters",
  chart: (type: string) => `/api/charts/${type}`,
  health: "/api/health",
  readiness: "/api/readiness",
  rca: "/api/rca",
  risk: "/api/risk",
} as const;

/** Structured API error */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Serialize FilterParams into URLSearchParams.
 * Uses repeated params (not CSV) for arrays.
 */
export function serializeFilters(filters?: FilterParams): string {
  if (!filters) return "";

  const params = new URLSearchParams();

  if (filters.dateRange?.start) params.set("date_start", filters.dateRange.start);
  if (filters.dateRange?.end) params.set("date_end", filters.dateRange.end);

  filters.companies?.forEach(v => params.append("companies", v));
  filters.causes?.forEach(v => params.append("causes", v));
  filters.channels?.forEach(v => params.append("channels", v));
  filters.statuses?.forEach(v => params.append("statuses", v));
  filters.results?.forEach(v => params.append("results", v));
  filters.responsibleUnits?.forEach(v => params.append("responsible_units", v));

  if (filters.managementTimeRange?.min !== undefined) {
    params.set("time_min", String(filters.managementTimeRange.min));
  }
  if (filters.managementTimeRange?.max !== undefined) {
    params.set("time_max", String(filters.managementTimeRange.max));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Fetch with timeout, single retry for transient errors only.
 * No retry for client errors (4xx) or server logic errors (500).
 */
async function fetchWithRetry<T>(endpoint: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Parse error body if available
      let errorBody: any = {};
      try { errorBody = await response.json(); } catch {}

      const code = errorBody?.error?.code || `HTTP_${response.status}`;
      const message = errorBody?.error?.message || `${response.status} ${response.statusText}`;

      // Only retry on 502, 503, 504 (transient infrastructure errors)
      if ([502, 503, 504].includes(response.status) && attempt < MAX_RETRIES) {
        lastError = new ApiError(response.status, endpoint, code, message);
        await delay(RETRY_DELAY_MS);
        continue;
      }

      // All other errors: throw immediately, no retry
      throw new ApiError(response.status, endpoint, code, message);

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) throw error;

      // Network error or abort — retry once
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
    }
  }

  throw new ApiError(
    0, endpoint, "NETWORK_ERROR",
    `No fue posible conectar con ${endpoint}: ${lastError?.message || "Error de red"}`
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Public API methods ───

export async function fetchKPIs(filters?: FilterParams): Promise<KPIData> {
  return fetchWithRetry<KPIData>(`${API_ENDPOINTS.kpis}${serializeFilters(filters)}`);
}

export async function fetchChartData(chartType: string, filters?: FilterParams): Promise<ChartDataResponse> {
  return fetchWithRetry<ChartDataResponse>(`${API_ENDPOINTS.chart(chartType)}${serializeFilters(filters)}`);
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  return fetchWithRetry<FilterOptions>(API_ENDPOINTS.filters);
}

export async function fetchQualityReport(filters?: FilterParams): Promise<QualityReportResponse> {
  return fetchWithRetry<QualityReportResponse>(`${API_ENDPOINTS.quality}${serializeFilters(filters)}`);
}

export async function fetchRiskModel(): Promise<RiskModelResponse> {
  return fetchWithRetry<RiskModelResponse>(API_ENDPOINTS.risk);
}

export async function fetchRCAFindings(): Promise<RCAFindingsResponse> {
  return fetchWithRetry<RCAFindingsResponse>(API_ENDPOINTS.rca);
}
