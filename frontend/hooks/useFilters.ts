"use client";

import { useCallback, useEffect, useState } from "react";
import type { FilterParams } from "@/lib/types";
import { parsePersistedFilterState } from "@/lib/filters/parse-persisted-filters";

export const FILTER_SESSION_KEY = "pqr-analytics-filters";

/**
 * Loads persisted filters from sessionStorage.
 * Validates structure before use. Removes corrupted data.
 */
function loadFromSession(): FilterParams {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(FILTER_SESSION_KEY);
    if (!raw) return {};
    const decoded: unknown = JSON.parse(raw);
    const result = parsePersistedFilterState(decoded);
    if (!result.valid) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[VantiOps] Invalid persisted filters were discarded");
      }
      sessionStorage.removeItem(FILTER_SESSION_KEY);
      return {};
    }
    return result.filters;
  } catch {
    sessionStorage.removeItem(FILTER_SESSION_KEY);
    return {};
  }
}

/**
 * Persists current filters to sessionStorage using versioned format.
 */
function saveToSession(filters: FilterParams): void {
  if (typeof window === "undefined") return;
  try {
    const state = { version: 1, filters };
    sessionStorage.setItem(FILTER_SESSION_KEY, JSON.stringify(state));
  } catch {
    // Silently ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Counts the total number of active filter dimensions.
 */
export function countActiveFilters(filters: FilterParams): number {
  let count = 0;
  if (filters.dateRange) count++;
  if (filters.companies?.length) count++;
  if (filters.causes?.length) count++;
  if (filters.channels?.length) count++;
  if (filters.statuses?.length) count++;
  if (filters.results?.length) count++;
  if (filters.responsibleUnits?.length) count++;
  if (filters.managementTimeRange) count++;
  return count;
}

export type FilterKey = keyof FilterParams;

export interface UseFiltersReturn {
  filters: FilterParams;
  activeCount: number;
  setFilter: <K extends FilterKey>(key: K, value: FilterParams[K]) => void;
  clearFilter: (key: FilterKey) => void;
  clearAll: () => void;
}

/**
 * Filter state management hook.
 * - Maintains FilterParams state with AND logic (all active filters are combined)
 * - Persists to sessionStorage with version 1 format
 * - Validates on load, discards corrupted data
 * - Provides setFilter/clearFilter/clearAll actions
 */
export function useFilters(): UseFiltersReturn {
  const [filters, setFilters] = useState<FilterParams>(() => loadFromSession());

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    saveToSession(filters);
  }, [filters]);

  const setFilter = useCallback(
    <K extends FilterKey>(key: K, value: FilterParams[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const clearFilter = useCallback((key: FilterKey) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
  }, []);

  const activeCount = countActiveFilters(filters);

  return { filters, activeCount, setFilter, clearFilter, clearAll };
}
