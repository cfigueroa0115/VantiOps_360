"use client";

import React from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartWrapper } from "./ChartWrapper";

interface CancellationDataPoint {
  category: string;
  count: number;
  percentage: number;
}

interface CancellationDonutProps {
  data: CancellationDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const COLORS = ["#3b82f6", "#e5e7eb"];

/**
 * Donut chart showing main cancellation cause vs all other causes combined.
 * Validates: Requirements 6.3
 */
export function CancellationDonut({
  data,
  loading,
  error,
  onRetry,
}: CancellationDonutProps) {
  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Participación de Causa Principal de Cancelación"
    >
      <div
        aria-label="Gráfico de dona mostrando la proporción de la causa principal de cancelación frente al resto de causas"
        role="img"
      >
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={110}
              dataKey="count"
              nameKey="category"
              paddingAngle={2}
              label={({ category, percentage }: CancellationDataPoint) =>
                `${category}: ${percentage.toFixed(1)}%`
              }
              labelLine={{ stroke: "#9ca3af" }}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value} registros`,
                name,
              ]}
            />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
