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

interface TopCausesDataPoint {
  causa: string;
  count: number;
}

interface TopCausesBarProps {
  data: TopCausesDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Horizontal bar chart showing top 10 causes ranked by count descending.
 * Validates: Requirements 6.2
 */
export function TopCausesBar({ data, loading, error, onRetry }: TopCausesBarProps) {
  // Take only top 10, already expected sorted descending
  const top10 = data.slice(0, 10);

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Top 10 Causas de PQR"
    >
      <div
        aria-label="Gráfico de barras horizontal mostrando las 10 causas principales de PQR ordenadas por cantidad descendente"
        role="img"
      >
        <ResponsiveContainer width="100%" height={380}>
          <BarChart
            data={top10}
            layout="vertical"
            margin={{ top: 5, right: 15, left: 0, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              label={{
                value: "Cantidad",
                position: "insideBottom",
                offset: -10,
                style: { fontSize: 11, fill: "#6b7280" },
              }}
            />
            <YAxis
              type="category"
              dataKey="causa"
              tick={{ fontSize: 9, fill: "#374151" }}
              width={145}
              tickFormatter={(value: string) =>
                value.length > 22 ? `${value.substring(0, 22)}…` : value
              }
            />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), "Cantidad"]}
              labelStyle={{ fontWeight: 600, fontSize: 12 }}
            />
            <Bar
              dataKey="count"
              fill="#22c55e"
              radius={[0, 4, 4, 0]}
              name="Cantidad"
              barSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
