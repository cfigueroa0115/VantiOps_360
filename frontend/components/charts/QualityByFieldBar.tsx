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
  Legend,
} from "recharts";
import { ChartWrapper } from "./ChartWrapper";

interface QualityFieldDataPoint {
  column_name: string;
  completeness_pct: number;
}

interface QualityByFieldBarProps {
  data: QualityFieldDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Stacked bar chart showing data quality completeness (non-null %) vs missing %
 * per column/field.
 * Validates: Requirements 6.11
 */
export function QualityByFieldBar({
  data,
  loading,
  error,
  onRetry,
}: QualityByFieldBarProps) {
  // Add missing percentage for stacking
  const chartData = data.map((d) => ({
    ...d,
    missing_pct: Math.round((100 - d.completeness_pct) * 100) / 100,
  }));

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Completitud por Campo"
    >
      <div
        aria-label="Gráfico de barras apiladas mostrando porcentaje de completitud y valores faltantes por cada campo de datos"
        role="img"
      >
        <ResponsiveContainer width="100%" height={350}>
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 20, left: 10, bottom: 70 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="column_name"
              angle={-35}
              textAnchor="end"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              interval={0}
              height={80}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              domain={[0, 100]}
              label={{
                value: "%",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "#6b7280" },
              }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}%`,
                name === "completeness_pct" ? "Completo" : "Faltante",
              ]}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend
              formatter={(value) =>
                value === "completeness_pct" ? "Completo" : "Faltante"
              }
            />
            <Bar
              dataKey="completeness_pct"
              stackId="quality"
              fill="#22c55e"
              name="completeness_pct"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="missing_pct"
              stackId="quality"
              fill="#ef4444"
              name="missing_pct"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
