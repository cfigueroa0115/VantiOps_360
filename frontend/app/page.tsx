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
import { useQualityReport } from "@/hooks/useQualityReport";
import { ParetoChart } from "@/components/charts/ParetoChart";
import { TopCausesBar } from "@/components/charts/TopCausesBar";
import { CancellationDonut } from "@/components/charts/CancellationDonut";
import { DistributionBar } from "@/components/charts/DistributionBar";
import { TemporalTrend } from "@/components/charts/TemporalTrend";
import { P90ByCauseBar } from "@/components/charts/P90ByCauseBar";
import { OpenCasesHistogram } from "@/components/charts/OpenCasesHistogram";
import { FindingsTable } from "@/components/charts/FindingsTable";
import { Database } from "lucide-react";

function QualityScoreCard({
  overallScore,
  dimensions,
  loading,
  error,
  onRetry,
}: {
  overallScore: number | null;
  dimensions: Record<string, number> | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const score = overallScore ?? 0;
  const color = score >= 90 ? "text-green-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  const barColor = score >= 90 ? "bg-green-500" : score >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <Database size={16} className="text-blue-500" />
        <h3 className="text-sm font-semibold text-gray-700">Calidad de Datos</h3>
        {loading && <span className="text-xs text-gray-400 animate-pulse ml-auto">…</span>}
        {error && (
          <button onClick={onRetry} className="text-xs text-red-500 hover:underline ml-auto">
            Reintentar
          </button>
        )}
      </div>
      {overallScore !== null ? (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-3xl font-bold ${color}`}>{score.toFixed(1)}%</span>
            <span className="text-xs text-gray-400">score compuesto</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(score, 100)}%` }} />
          </div>
          {dimensions && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-gray-500">Completitud:</span> <span className="font-medium">{dimensions.completeness?.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Validez:</span> <span className="font-medium">{dimensions.validity?.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Consistencia:</span> <span className="font-medium">{dimensions.consistency?.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Unicidad:</span> <span className="font-medium">{dimensions.uniqueness?.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Oportunidad:</span> <span className="font-medium">{dimensions.timeliness?.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Dominio:</span> <span className="font-medium">{dimensions.domainConformity?.toFixed(1)}%</span></div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-400">Sin datos</p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { filters, activeCount, setFilter, clearFilter, clearAll } = useFilters();
  const { data: kpiData, loading: kpiLoading, error: kpiError, retry: kpiRetry } = useKPIs(filters);
  const { options: filterOptions, loading: optionsLoading } = useFilterOptions();

  const pareto = useChartData("pareto", filters);
  const topCauses = useChartData("top_causes", filters);
  const donut = useChartData("cancellation_donut", filters);
  const trend = useChartData("temporal_trend", filters);
  const distCompany = useChartData("distribution_company", filters);
  const distChannel = useChartData("distribution_channel", filters);
  const distResult = useChartData("distribution_result", filters);
  const p90 = useChartData("p90_by_cause", filters);
  const histogram = useChartData("open_cases_histogram", filters);
  const quality = useQualityReport(filters);

  const lastUpdated = kpiData
    ? new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })
    : undefined;

  return (
    <div className="flex flex-col h-full">
      <Header activeFilterCount={activeCount} lastUpdated={lastUpdated} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <ActiveFilters
          filters={filters}
          onClearFilter={clearFilter}
          onClearAll={clearAll}
          recordCount={kpiData?.totalPqr}
        />

        <section aria-label="Indicadores clave de rendimiento">
          <KPIGrid data={kpiData} loading={kpiLoading} error={kpiError} onRetry={kpiRetry} />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
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

          <div className="space-y-6 lg:col-span-3">
            <ErrorBoundary>
              <ParetoChart
                data={(pareto.data?.data || []) as any[]}
                loading={pareto.loading}
                error={pareto.error}
                onRetry={pareto.retry}
              />
            </ErrorBoundary>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ErrorBoundary>
                <TopCausesBar
                  data={(topCauses.data?.data || []) as any[]}
                  loading={topCauses.loading}
                  error={topCauses.error}
                  onRetry={topCauses.retry}
                />
              </ErrorBoundary>

              <ErrorBoundary>
                <CancellationDonut
                  data={(donut.data?.data || []) as any[]}
                  loading={donut.loading}
                  error={donut.error}
                  onRetry={donut.retry}
                />
              </ErrorBoundary>
            </div>

            <ErrorBoundary>
              <TemporalTrend
                data={(trend.data?.data || []) as any[]}
                loading={trend.loading}
                error={trend.error}
                onRetry={trend.retry}
              />
            </ErrorBoundary>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <ErrorBoundary>
                <DistributionBar
                  data={(distCompany.data?.data || []) as any[]}
                  title="Distribución por Empresa"
                  loading={distCompany.loading}
                  error={distCompany.error}
                  onRetry={distCompany.retry}
                />
              </ErrorBoundary>
              <ErrorBoundary>
                <DistributionBar
                  data={(distChannel.data?.data || []) as any[]}
                  title="Distribución por Canal"
                  color="#8b5cf6"
                  loading={distChannel.loading}
                  error={distChannel.error}
                  onRetry={distChannel.retry}
                />
              </ErrorBoundary>
              <ErrorBoundary>
                <DistributionBar
                  data={(distResult.data?.data || []) as any[]}
                  title="Distribución por Resultado"
                  color="#06b6d4"
                  loading={distResult.loading}
                  error={distResult.error}
                  onRetry={distResult.retry}
                />
              </ErrorBoundary>
            </div>

            <ErrorBoundary>
              <P90ByCauseBar
                data={(p90.data?.data || []) as any[]}
                loading={p90.loading}
                error={p90.error}
                onRetry={p90.retry}
              />
            </ErrorBoundary>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ErrorBoundary>
                <OpenCasesHistogram
                  data={(histogram.data?.data || []) as any[]}
                  loading={histogram.loading}
                  error={histogram.error}
                  onRetry={histogram.retry}
                />
              </ErrorBoundary>
              <ErrorBoundary>
                <QualityScoreCard
                  overallScore={quality.data?.overallScore ?? null}
                  dimensions={quality.data?.dimensions ? (quality.data.dimensions as unknown as Record<string, number>) : null}
                  loading={quality.loading}
                  error={quality.error}
                  onRetry={quality.retry}
                />
              </ErrorBoundary>
            </div>

            <ErrorBoundary>
              <FindingsTable
                data={[
                  { description: "Cancela Servihogar a solicitud cliente concentra ~50% del volumen total", affected_metric: "main_cause_share", severity: "high" as const, recommended_action: "Implementar proceso de retención y análisis de causa raíz" },
                  { description: "Canales telefónico y verbal representan >96% de la demanda", affected_metric: "channel_distribution", severity: "medium" as const, recommended_action: "Desarrollar canales digitales de autoservicio" },
                  { description: "P90 de tiempo de gestión en 10 días para casos específicos", affected_metric: "p90_management_time", severity: "medium" as const, recommended_action: "Automatizar routing y reducir re-envíos" },
                  { description: "Campos motivo_cierre y marcación presentan alta nulidad", affected_metric: "data_quality", severity: "medium" as const, recommended_action: "Implementar validaciones obligatorias en formulario de cierre" },
                ]}
                loading={false}
                error={null}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
