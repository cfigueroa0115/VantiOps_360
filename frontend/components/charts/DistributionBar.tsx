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

interface DistributionDataPoint {
  category: string;
  count: number;
}

interface DistributionBarProps {
  data: DistributionDataPoint[];
  xKey?: string;
  yKey?: string;
  title?: string;
  color?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Reusable vertical bar chart for category distributions (company, channel, result).
 * Data sorted by frequency descending.
 * Validates: Requirements 6.4
 */
export function DistributionBar({
  data,
  xKey = "category",
  yKey = "count",
  title = "Distribución",
  color = "#f59e0b",
  loading,
  error,
  onRetry,
}: DistributionBarProps) {
  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title={title}
    >
      <div
        aria-label={`Gráfico de barras mostrando distribución de ${title} ordenado por frecuencia`}
        role="img"
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{ top: 10, right: 20, left: 10, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey={xKey}
              angle={-30}
              textAnchor="end"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              interval={0}
              height={70}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              label={{
                value: "Cantidad",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "#6b7280" },
              }}
            />
            <Tooltip
              formatter={(value: number) => [value, "Cantidad"]}
              labelStyle={{ fontWeight: 600 }}
            />
            <Bar
              dataKey={yKey}
              fill={color}
              radius={[4, 4, 0, 0]}
              name="Cantidad"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
