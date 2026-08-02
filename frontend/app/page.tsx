"use client";

import React from "react";
import { Header } from "@/components/layout/Header";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { KPIGrid } from "@/components/kpi/KPIGrid";
import { ActiveFilters } from "@/components/filters/ActiveFilters";
import { FilterPanel } from "@/components/filters/FilterPanel";
import { useFilters } from "@/hooks/useFilters";
import { useKPIs } from "@/hooks/useKPIs";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { useChartData } from "@/hooks/useChartData";
import { DataQualityScore } from "@/components/shared/DataQualityScore";

/**
 * Main dashboard page.
 * Assembles KPIs, filters, charts, and the Data Quality Score.
 * (Req 5.2, 5.3, 5.5, 14.8)
 */
export default function DashboardPage() {
  // Filter state management
  const { filters, activeCount, setFilter, clearFilter, clearAll } =
    useFilters();

  // KPI data fetching with filter dependency
  const { data: kpiData, loading: kpiLoading, error: kpiError, retry: kpiRetry } =
    useKPIs(filters);

  // Filter options for the filter panel
  const { options: filterOptions, loading: optionsLoading } =
    useFilterOptions();

  // Chart data hooks
  const {
    data: trendData,
    loading: trendLoading,
    error: trendError,
  } = useChartData("trend_monthly", filters);

  const {
    data: causeData,
    loading: causeLoading,
    error: causeError,
  } = useChartData("pqr_by_cause", filters);

  const {
    data: channelData,
    loading: channelLoading,
    error: channelError,
  } = useChartData("pqr_by_channel", filters);

  // Last updated from KPI metadata or current time
  const lastUpdated = kpiData
    ? new Date().toLocaleString("es-CO", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <Header activeFilterCount={activeCount} lastUpdated={lastUpdated} />

      {/* Page content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Active filters bar */}
        <ActiveFilters
          filters={filters}
          onClearFilter={clearFilter}
          onClearAll={clearAll}
          recordCount={kpiData?.totalPqr}
        />

        {/* KPI Grid section */}
        <section aria-label="Indicadores clave de rendimiento">
          <KPIGrid
            data={kpiData}
            loading={kpiLoading}
            error={kpiError}
            onRetry={kpiRetry}
          />
        </section>

        {/* Data Quality Score */}
        {kpiData && (
          <section aria-label="Score de calidad de datos">
            <DataQualityScore score={kpiData.dataQualityScore} />
          </section>
        )}

        {/* Main content grid: Filters + Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Filter panel (collapsible) — 1 col on lg */}
          <div className="lg:col-span-1">
            <FilterPanel
              filters={filters}
              activeCount={activeCount}
              options={filterOptions}
              loading={optionsLoading}
              onSetFilter={setFilter}
              onClearFilter={clearFilter}
              onClearAll={clearAll}
            />
          </div>

          {/* Chart sections — 3 cols on lg */}
          <div className="space-y-6 lg:col-span-3">
            {/* Trend chart */}
            <ErrorBoundary>
              <section
                className="rounded-lg border bg-white p-4 shadow-sm"
                aria-label="Tendencia mensual de PQR"
              >
                <h2 className="mb-3 text-sm font-semibold text-gray-800">
                  Tendencia Mensual
                </h2>
                {trendLoading && !trendData && (
                  <div className="flex h-48 items-center justify-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  </div>
                )}
                {trendError && !trendData && (
                  <p className="text-sm text-destructive">{trendError}</p>
                )}
                {trendData && (
                  <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                    {/* Chart component will be rendered here in subsequent tasks */}
                    Gráfico de tendencia ({trendData.metadata.recordCount} registros)
                  </div>
                )}
              </section>
            </ErrorBoundary>

            {/* Cause distribution chart */}
            <ErrorBoundary>
              <section
                className="rounded-lg border bg-white p-4 shadow-sm"
                aria-label="Distribución por causa"
              >
                <h2 className="mb-3 text-sm font-semibold text-gray-800">
                  Distribución por Causa
                </h2>
                {causeLoading && !causeData && (
                  <div className="flex h-48 items-center justify-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  </div>
                )}
                {causeError && !causeData && (
                  <p className="text-sm text-destructive">{causeError}</p>
                )}
                {causeData && (
                  <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                    {/* Chart component will be rendered here in subsequent tasks */}
                    Gráfico de causas ({causeData.metadata.recordCount} registros)
                  </div>
                )}
              </section>
            </ErrorBoundary>

            {/* Channel distribution chart */}
            <ErrorBoundary>
              <section
                className="rounded-lg border bg-white p-4 shadow-sm"
                aria-label="Distribución por canal"
              >
                <h2 className="mb-3 text-sm font-semibold text-gray-800">
                  Distribución por Canal
                </h2>
                {channelLoading && !channelData && (
                  <div className="flex h-48 items-center justify-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  </div>
                )}
                {channelError && !channelData && (
                  <p className="text-sm text-destructive">{channelError}</p>
                )}
                {channelData && (
                  <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                    {/* Chart component will be rendered here in subsequent tasks */}
                    Gráfico de canales ({channelData.metadata.recordCount} registros)
                  </div>
                )}
              </section>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
