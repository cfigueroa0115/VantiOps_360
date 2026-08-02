"use client";

import React from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartWrapper } from "./ChartWrapper";

interface ParetoDataPoint {
  causa: string;
  count: number;
  percentage: number;
  cumulative_pct: number;
}

interface ParetoChartProps {
  data: ParetoDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Pareto chart: causes sorted by frequency (bars) with cumulative % line
 * on a secondary y-axis (0-100%).
 * Validates: Requirements 6.1
 */
export function ParetoChart({ data, loading, error, onRetry }: ParetoChartProps) {
  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Diagrama de Pareto — Causas por Frecuencia"
    >
      <div
        aria-label="Diagrama de Pareto mostrando causas de PQR ordenadas por frecuencia con línea de porcentaje acumulado"
        role="img"
      >
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 40, left: 10, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="causa"
              angle={-35}
              textAnchor="end"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              interval={0}
              height={80}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              label={{
                value: "Frecuencia",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "#6b7280" },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#6b7280" }}
              label={{
                value: "% Acumulado",
                angle: 90,
                position: "insideRight",
                style: { fontSize: 12, fill: "#6b7280" },
              }}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "Frecuencia") return [value, "Frecuencia"];
                return [`${value.toFixed(1)}%`, "% Acumulado"];
              }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend verticalAlign="top" height={36} />
            <Bar
              yAxisId="left"
              dataKey="count"
              name="Frecuencia"
              fill="#3b82f6"
              radius={[2, 2, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulative_pct"
              name="% Acumulado"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 3, fill: "#ef4444" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
