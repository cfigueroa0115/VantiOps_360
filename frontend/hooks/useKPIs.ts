"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FilterParams, KPIData } from "@/lib/types";
import { fetchKPIs } from "@/lib/api-client";

export interface UseKPIsResult {
  /** Fetched KPI data; null if never loaded */
  data: KPIData | null;
  /** Whether a request is currently in flight */
  loading: boolean;
  /** Error message if the last request failed; null on success */
  error: string | null;
  /** Manually retry the last failed request */
  retry: () => void;
}

/**
 * Custom hook for fetching KPI data with caching, loading/error states,
 * and a retry mechanism.
 *
 * - Caches last successful response in state (Req 5.6: preserve previous values on error)
 * - Accepts FilterParams to refetch when filters change
 * - Provides a retry function for manual error recovery
 */
export function useKPIs(filters?: FilterParams): UseKPIsResult {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Track latest request to avoid stale responses
  const requestIdRef = useRef<number>(0);

  const load = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchKPIs(filters);

      // Only apply result if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        const message =
          err instanceof Error ? err.message : "Error al obtener los KPIs";
        setError(message);
        // Data is preserved (not cleared) per Req 5.6
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [filters]);

  // Fetch on mount and when filters change
  useEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(() => {
    load();
  }, [load]);

  return { data, loading, error, retry };
}
