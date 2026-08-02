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
  Cell,
} from "recharts";
import { ChartWrapper } from "./ChartWrapper";

interface HistogramDataPoint {
  bucket: string;
  count: number;
}

interface OpenCasesHistogramProps {
  data: HistogramDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Color scale from green (recent) to red (overdue) for age buckets */
const BUCKET_COLORS = [
  "#22c55e", // 0-7 days (green)
  "#84cc16", // 8-14 days (lime)
  "#eab308", // 15-21 days (yellow)
  "#f97316", // 22-28 days (orange)
  "#ef4444", // 29-60 days (red)
  "#991b1b", // 61+ days (dark red)
];

/**
 * Histogram showing age distribution of open cases in 7-day buckets.
 * Buckets: 0-7, 8-14, 15-21, 22-28, 29-60, 61+ days.
 * Color-coded from green (recent) to red (overdue).
 * Validates: Requirements 6.10
 */
export function OpenCasesHistogram({
  data,
  loading,
  error,
  onRetry,
}: OpenCasesHistogramProps) {
  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Distribución de Antigüedad — Casos Abiertos"
    >
      <div
        aria-label="Histograma mostrando distribución de antigüedad de casos abiertos en intervalos de 7 días con colores de verde (recientes) a rojo (vencidos)"
        role="img"
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{ top: 10, right: 20, left: 10, bottom: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              label={{
                value: "Antigüedad (días)",
                position: "insideBottom",
                offset: -15,
                style: { fontSize: 12, fill: "#6b7280" },
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              label={{
                value: "Casos",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "#6b7280" },
              }}
            />
            <Tooltip
              formatter={(value: number) => [value, "Casos"]}
              labelFormatter={(label) => `Rango: ${label} días`}
              labelStyle={{ fontWeight: 600 }}
            />
            <Bar dataKey="count" name="Casos" radius={[4, 4, 0, 0]}>
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={BUCKET_COLORS[index % BUCKET_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
