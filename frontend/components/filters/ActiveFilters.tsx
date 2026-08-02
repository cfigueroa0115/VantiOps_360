"use client";

import React from "react";
import { X } from "lucide-react";
import type { FilterParams } from "@/lib/types";
import type { FilterKey } from "@/hooks/useFilters";
import { cn, formatNumber } from "@/lib/utils";

/** Maps filter keys to human-readable labels in Spanish */
const FILTER_LABELS: Record<FilterKey, string> = {
  dateRange: "Periodo",
  companies: "Empresa",
  causes: "Causa",
  channels: "Canal",
  statuses: "Estado",
  results: "Resultado",
  responsibleUnits: "Unidad responsable",
  managementTimeRange: "Tiempo de gestión",
};

export interface ActiveFiltersProps {
  /** Current filter state */
  filters: FilterParams;
  /** Callback to remove a single filter */
  onClearFilter: (key: FilterKey) => void;
  /** Callback to clear all filters */
  onClearAll: () => void;
  /** Number of records matching current filters */
  recordCount?: number;
  /** Additional class names */
  className?: string;
}

/**
 * ActiveFilters — Horizontal pill display of active filters with X remove button
 * and "Limpiar todo" button to clear all. Shows record count.
 * (Req 7.6: Active filter count + "Clear All")
 * (Req 7.8: Record count update on filter change)
 */
export function ActiveFilters({
  filters,
  onClearFilter,
  onClearAll,
  recordCount,
  className,
}: ActiveFiltersProps) {
  const activeKeys = getActiveFilterKeys(filters);

  if (activeKeys.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Record count */}
      {recordCount !== undefined && (
        <span className="text-sm text-gray-600">
          {formatNumber(recordCount)} registros
        </span>
      )}

      {/* Filter pills */}
      {activeKeys.map((key) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200
                     px-2.5 py-0.5 text-xs font-medium text-blue-700"
        >
          {FILTER_LABELS[key]}: {getFilterSummary(filters, key)}
          <button
            type="button"
            onClick={() => onClearFilter(key)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100 focus:outline-none"
            aria-label={`Eliminar filtro ${FILTER_LABELS[key]}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {/* Clear all button */}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline"
      >
        Limpiar todo
      </button>
    </div>
  );
}

/** Returns an array of active filter keys */
function getActiveFilterKeys(filters: FilterParams): FilterKey[] {
  const keys: FilterKey[] = [];
  if (filters.dateRange) keys.push("dateRange");
  if (filters.companies?.length) keys.push("companies");
  if (filters.causes?.length) keys.push("causes");
  if (filters.channels?.length) keys.push("channels");
  if (filters.statuses?.length) keys.push("statuses");
  if (filters.results?.length) keys.push("results");
  if (filters.responsibleUnits?.length) keys.push("responsibleUnits");
  if (filters.managementTimeRange) keys.push("managementTimeRange");
  return keys;
}

/** Returns a short text summary of a filter's current value */
function getFilterSummary(filters: FilterParams, key: FilterKey): string {
  switch (key) {
    case "dateRange":
      return filters.dateRange
        ? `${filters.dateRange.start || "..."} — ${filters.dateRange.end || "..."}`
        : "";
    case "companies":
      return summarizeArray(filters.companies);
    case "causes":
      return summarizeArray(filters.causes);
    case "channels":
      return summarizeArray(filters.channels);
    case "statuses":
      return summarizeArray(filters.statuses);
    case "results":
      return summarizeArray(filters.results);
    case "responsibleUnits":
      return summarizeArray(filters.responsibleUnits);
    case "managementTimeRange":
      return filters.managementTimeRange
        ? `${filters.managementTimeRange.min}–${filters.managementTimeRange.max} días`
        : "";
    default:
      return "";
  }
}

function summarizeArray(arr?: string[]): string {
  if (!arr || arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  return `${arr.length} seleccionados`;
}
