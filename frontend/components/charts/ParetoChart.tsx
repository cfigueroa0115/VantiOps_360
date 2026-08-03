"use client";

import React from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ChartWrapper } from "./ChartWrapper";
import { buildExecutivePareto, type ParetoDataPoint } from "@/lib/charts/pareto";
import { formatPercent } from "@/lib/charts/number-format";

interface ParetoChartProps {
  data: ParetoDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function truncateLabel(value: string, max = 26) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function ParetoChart({ data, loading, error, onRetry }: ParetoChartProps) {
  const pareto = buildExecutivePareto(data);

  return (
    <ChartWrapper loading={loading} error={error} onRetry={onRetry} data={data} title="Diagrama de Pareto — Causas Principales">
      <div aria-label="Diagrama de Pareto ejecutivo mostrando las causas principales hasta el umbral 80%" role="img">
        {pareto.data.length > 0 && (
          <div className="text-sm text-gray-600 mb-3 space-y-1">
            <p>
              Las <strong>{pareto.coreCauseCount}</strong> causas principales explican el <strong>{formatPercent(pareto.coreCumulativePct)}</strong> del volumen.
            </p>
            {pareto.contextCauseCount > 0 && (
              <p>
                Se muestran <strong>{pareto.contextCauseCount}</strong> causas adicionales como contexto.
              </p>
            )}
            {pareto.hiddenCauseCount > 0 && (
              <p className="text-gray-500">
                Se agruparon {pareto.hiddenCauseCount} causas en &quot;Otras causas&quot;.
              </p>
            )}
          </div>
        )}
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={pareto.data} margin={{ top: 10, right: 50, left: 10, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="causa"
              angle={-35}
              textAnchor="end"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickFormatter={(v) => truncateLabel(v)}
              height={90}
            />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: "Frecuencia", angle: -90, position: "insideLeft", style: { fontSize: 12 } }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "Frecuencia") return [value.toLocaleString("es-CO"), "Frecuencia"];
                return [formatPercent(value), "% Acumulado"];
              }}
              labelFormatter={(label) => label}
            />
            <Legend verticalAlign="top" height={36} />
            <ReferenceLine yAxisId="right" y={80} stroke="#f59e0b" strokeDasharray="6 4" label={{ value: "80%", position: "right", fill: "#f59e0b", fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="count" name="Frecuencia" fill="#22c55e" radius={[2, 2, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="cumulative_pct" name="% Acumulado" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
