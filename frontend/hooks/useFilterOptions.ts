"use client";

import { useEffect, useState } from "react";
import type { FilterOptions } from "@/lib/types";
import { fetchFilterOptions } from "@/lib/api-client";

export interface UseFilterOptionsReturn {
  options: FilterOptions | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches available filter options from the backend API on mount.
 * Returns the options, loading state, and any error message.
 * (Req 7.7: Options populated from backend API)
 */
export function useFilterOptions(): UseFilterOptionsReturn {
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchFilterOptions();
        if (!cancelled) {
          setOptions(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Error al cargar opciones de filtro",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { options, loading, error };
}
