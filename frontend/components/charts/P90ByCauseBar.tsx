"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartWrapper } from "./ChartWrapper";

interface P90DataPoint {
  causa: string;
  p90: number;
  count: number;
}

interface P90ByCauseBarProps {
  data: P90DataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Horizontal bar chart showing P90 management time for top 10 causes,
 * ranked descending by P90 value.
 * Validates: Requirements 6.8
 */
export function P90ByCauseBar({
  data,
  loading,
  error,
  onRetry,
}: P90ByCauseBarProps) {
  // Sort by P90 descending and take top 10
  const sorted = [...data]
    .sort((a, b) => b.p90 - a.p90)
    .slice(0, 10);

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="P90 Tiempo de Gestión por Causa"
    >
      <div
        aria-label="Gráfico de barras horizontal mostrando el percentil 90 del tiempo de gestión para las 10 causas principales ordenadas descendentemente"
        role="img"
      >
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 10, right: 30, left: 160, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              label={{
                value: "P90 (días)",
                position: "insideBottom",
                offset: -5,
                style: { fontSize: 12, fill: "#6b7280" },
              }}
            />
            <YAxis
              type="category"
              dataKey="causa"
              tick={{ fontSize: 11, fill: "#374151" }}
              width={150}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload || !payload.length) return null;
                const d = payload[0].payload as P90DataPoint;
                return (
                  <div className="rounded border border-gray-200 bg-white p-2 text-xs shadow-md">
                    <p className="font-semibold text-gray-700">{d.causa}</p>
                    <p>P90: {d.p90} días</p>
                    <p>Registros: {d.count}</p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="p90"
              fill="#8b5cf6"
              radius={[0, 4, 4, 0]}
              name="P90 (días)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
