"use client";

import React from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Filter, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterParams, FilterOptions } from "@/lib/types";
import type { FilterKey } from "@/hooks/useFilters";
import { DateRangePicker } from "./DateRangePicker";
import { MultiSelect } from "./MultiSelect";
import { RangeSlider } from "./RangeSlider";

export interface FilterPanelProps {
  /** Current filter state */
  filters: FilterParams;
  /** Active filter count */
  activeCount: number;
  /** Available filter options from the backend */
  options: FilterOptions | null;
  /** Whether filter options are loading */
  loading: boolean;
  /** Set a specific filter value */
  onSetFilter: <K extends FilterKey>(key: K, value: FilterParams[K]) => void;
  /** Clear a specific filter */
  onClearFilter: (key: FilterKey) => void;
  /** Clear all filters */
  onClearAll: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * FilterPanel — Collapsible sidebar using @radix-ui/react-collapsible.
 * Contains all filter controls. Shows active filter count badge.
 * (Req 7.1-7.8)
 */
export function FilterPanel({
  filters,
  activeCount,
  options,
  loading,
  onSetFilter,
  onClearFilter,
  onClearAll,
  className,
}: FilterPanelProps) {
  const [open, setOpen] = React.useState(true);

  const maxTime = options?.managementTimeMax ?? 365;

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "rounded-lg border border-gray-200 bg-white shadow-sm",
        className,
      )}
    >
      {/* Panel header */}
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-gray-50"
          aria-label={open ? "Colapsar filtros" : "Expandir filtros"}
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-semibold text-gray-800">Filtros</span>
            {activeCount > 0 && (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full
                           bg-blue-600 px-1.5 text-xs font-medium text-white"
              >
                {activeCount}
              </span>
            )}
          </div>
          <ChevronRight
            className={cn(
              "h-4 w-4 text-gray-400 transition-transform duration-200",
              open && "rotate-90",
            )}
          />
        </button>
      </Collapsible.Trigger>

      {/* Panel content */}
      <Collapsible.Content className="border-t border-gray-100">
        <div className="space-y-4 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className="ml-2 text-sm text-gray-500">Cargando opciones...</span>
            </div>
          ) : (
            <>
              {/* Date Range */}
              <DateRangePicker
                startDate={filters.dateRange?.start}
                endDate={filters.dateRange?.end}
                onChange={(range) => {
                  if (range) {
                    onSetFilter("dateRange", range);
                  } else {
                    onClearFilter("dateRange");
                  }
                }}
              />

              {/* Company multi-select */}
              <MultiSelect
                label="Empresa"
                options={options?.companies ?? []}
                selected={filters.companies ?? []}
                onChange={(val) => {
                  if (val.length > 0) {
                    onSetFilter("companies", val);
                  } else {
                    onClearFilter("companies");
                  }
                }}
                placeholder="Todas las empresas"
              />

              {/* Cause multi-select */}
              <MultiSelect
                label="Causa"
                options={options?.causes ?? []}
                selected={filters.causes ?? []}
                onChange={(val) => {
                  if (val.length > 0) {
                    onSetFilter("causes", val);
                  } else {
                    onClearFilter("causes");
                  }
                }}
                placeholder="Todas las causas"
              />

              {/* Channel multi-select */}
              <MultiSelect
                label="Canal de atención"
                options={options?.channels ?? []}
                selected={filters.channels ?? []}
                onChange={(val) => {
                  if (val.length > 0) {
                    onSetFilter("channels", val);
                  } else {
                    onClearFilter("channels");
                  }
                }}
                placeholder="Todos los canales"
              />

              {/* Status multi-select */}
              <MultiSelect
                label="Estado"
                options={options?.statuses ?? []}
                selected={filters.statuses ?? []}
                onChange={(val) => {
                  if (val.length > 0) {
                    onSetFilter("statuses", val);
                  } else {
                    onClearFilter("statuses");
                  }
                }}
                placeholder="Todos los estados"
              />

              {/* Result multi-select */}
              <MultiSelect
                label="Resultado"
                options={options?.results ?? []}
                selected={filters.results ?? []}
                onChange={(val) => {
                  if (val.length > 0) {
                    onSetFilter("results", val);
                  } else {
                    onClearFilter("results");
                  }
                }}
                placeholder="Todos los resultados"
              />

              {/* Responsible unit multi-select */}
              <MultiSelect
                label="Unidad responsable"
                options={options?.responsibleUnits ?? []}
                selected={filters.responsibleUnits ?? []}
                onChange={(val) => {
                  if (val.length > 0) {
                    onSetFilter("responsibleUnits", val);
                  } else {
                    onClearFilter("responsibleUnits");
                  }
                }}
                placeholder="Todas las unidades"
              />

              {/* Management time range slider */}
              <RangeSlider
                min={0}
                max={maxTime}
                value={[
                  filters.managementTimeRange?.min ?? 0,
                  filters.managementTimeRange?.max ?? maxTime,
                ]}
                onChange={(range) => {
                  // Only set filter if range differs from full range
                  if (range.min === 0 && range.max === maxTime) {
                    onClearFilter("managementTimeRange");
                  } else {
                    onSetFilter("managementTimeRange", range);
                  }
                }}
              />

              {/* Clear all button */}
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2
                             text-sm font-medium text-red-700 hover:bg-red-100
                             focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  Limpiar todos los filtros
                </button>
              )}
            </>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
