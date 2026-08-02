"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChartDataResponse, FilterParams } from "@/lib/types";
import { fetchChartData } from "@/lib/api-client";

export interface UseChartDataResult {
  /** Fetched chart data; null if never loaded */
  data: ChartDataResponse | null;
  /** Whether a request is currently in flight */
  loading: boolean;
  /** Error message if the last request failed; null on success */
  error: string | null;
  /** Manually retry the last failed request */
  retry: () => void;
}

/**
 * Custom hook for fetching chart data by chart type with filter dependency.
 * Refetches automatically when filters change.
 *
 * - Preserves last successful data on error (Req 5.6)
 * - Provides retry mechanism for manual error recovery
 * - Cancels stale requests to avoid race conditions
 *
 * @param chartType - The chart type identifier (e.g., "pqr_by_cause", "trend_monthly")
 * @param filters - Optional filter parameters; refetch triggers on change
 */
export function useChartData(
  chartType: string,
  filters?: FilterParams,
): UseChartDataResult {
  const [data, setData] = useState<ChartDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Track latest request to avoid stale responses
  const requestIdRef = useRef<number>(0);

  const load = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchChartData(chartType, filters);

      // Only apply result if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al obtener datos del gráfico";
        setError(message);
        // Data is preserved (not cleared) per Req 5.6
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [chartType, filters]);

  // Fetch on mount and when chartType or filters change
  useEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(() => {
    load();
  }, [load]);

  return { data, loading, error, retry };
}
