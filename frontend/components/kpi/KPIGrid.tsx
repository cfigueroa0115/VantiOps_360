"use client";

import React from "react";
import { KPICard, type KPIFormatType } from "@/components/kpi/KPICard";
import { KPILoadingSkeleton } from "@/components/kpi/KPILoadingSkeleton";
import type { KPIData } from "@/lib/types";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Hash,
  Percent,
  TrendingUp,
  Activity,
  Timer,
  Layers,
  PieChart,
  ShieldAlert,
  Database,
} from "lucide-react";

/** KPI card definition mapping each metric to its display configuration */
interface KPIDefinition {
  key: keyof KPIData;
  label: string;
  format: KPIFormatType;
  icon: React.ReactNode;
}

const KPI_DEFINITIONS: KPIDefinition[] = [
  { key: "totalPqr", label: "Total PQR", format: "number", icon: <BarChart3 size={16} /> },
  { key: "closedPqr", label: "PQR Cerradas", format: "number", icon: <CheckCircle2 size={16} /> },
  { key: "inProcessPqr", label: "PQR En Proceso", format: "number", icon: <Clock size={16} /> },
  { key: "percentageClosed", label: "Porcentaje Cerradas", format: "percentage", icon: <Percent size={16} /> },
  { key: "avgManagementTime", label: "Tiempo Gestión Promedio", format: "days", icon: <Timer size={16} /> },
  { key: "medianManagementTime", label: "Tiempo Gestión Mediana", format: "days", icon: <Activity size={16} /> },
  { key: "p90ManagementTime", label: "Tiempo Gestión P90", format: "days", icon: <TrendingUp size={16} /> },
  { key: "p95ManagementTime", label: "Tiempo Gestión P95", format: "days", icon: <TrendingUp size={16} /> },
  { key: "maxManagementTime", label: "Tiempo Gestión Máximo", format: "days", icon: <AlertTriangle size={16} /> },
  { key: "distinctCausesCount", label: "Causas Distintas", format: "number", icon: <Hash size={16} /> },
  { key: "mainCauseSharePct", label: "Participación Causa Principal", format: "percentage", icon: <PieChart size={16} /> },
  { key: "qualityIssuesPct", label: "Problemas de Calidad", format: "percentage", icon: <ShieldAlert size={16} /> },
  { key: "dataQualityScore", label: "Score Calidad de Datos", format: "percentage", icon: <Database size={16} /> },
];

export interface KPIGridProps {
  /** KPI data object; null/undefined when not yet loaded */
  data: KPIData | null | undefined;
  /** Whether data is currently loading */
  loading: boolean;
  /** Error message if the API call failed */
  error: string | null;
  /** Callback to retry the failed API call */
  onRetry?: () => void;
}

/**
 * Responsive grid layout displaying all KPI cards with executive hierarchy.
 * Primary KPIs (Total PQR, % Cerradas, Concentración Causa Principal) get prominent sizing.
 * Handles loading, error, and data states.
 */
export function KPIGrid({ data, loading, error, onRetry }: KPIGridProps) {
  // Error state
  if (error && !data) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center" role="alert">
        <p className="text-sm text-destructive mb-3">{error}</p>
        {onRetry && (
          <button onClick={onRetry} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Reintentar
          </button>
        )}
      </div>
    );
  }

  // Primary KPIs for executive hierarchy
  const PRIMARY_KEYS: Array<keyof KPIData> = ["totalPqr", "percentageClosed", "mainCauseSharePct"];
  const primaryDefs = KPI_DEFINITIONS.filter((k) => PRIMARY_KEYS.includes(k.key));
  const secondaryDefs = KPI_DEFINITIONS.filter((k) => !PRIMARY_KEYS.includes(k.key));

  return (
    <div className="space-y-4">
      {/* Loading state */}
      {loading && !data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <KPILoadingSkeleton count={13} />
        </div>
      )}

      {data && (
        <>
          {error && (
            <div className="col-span-full rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-center justify-between" role="alert">
              <p className="text-sm text-destructive">{error}</p>
              {onRetry && (
                <button onClick={onRetry} className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  Reintentar
                </button>
              )}
            </div>
          )}

          {/* Primary KPIs — executive hierarchy */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {primaryDefs.map((kpi) => (
              <KPICard key={kpi.key} label={kpi.label} value={loading ? undefined : data[kpi.key]} format={kpi.format} icon={kpi.icon} prominent />
            ))}
          </div>

          {/* Executive Insight */}
          {data.mainCauseSharePct != null && data.percentageClosed != null && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3">
              <p className="text-xs font-medium text-blue-900">
                Lectura ejecutiva: La causa principal concentra el {data.mainCauseSharePct}% del volumen total.
                Con {data.percentageClosed}% de casos cerrados, el principal foco de mejora está en reducir la recurrencia y concentración de las causas de mayor volumen.
              </p>
            </div>
          )}

          {/* Secondary KPIs */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {secondaryDefs.map((kpi) => (
              <KPICard key={kpi.key} label={kpi.label} value={loading ? undefined : data[kpi.key]} format={kpi.format} icon={kpi.icon} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
