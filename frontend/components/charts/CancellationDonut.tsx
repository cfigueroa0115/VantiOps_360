"use client";

import React from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartWrapper } from "./ChartWrapper";
import { formatPercent } from "@/lib/charts/number-format";

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

function isValidData(data: CancellationDataPoint[]): boolean {
  if (!data || data.length === 0) return false;
  return data.every(
    (d) =>
      typeof d.count === "number" &&
      Number.isFinite(d.count) &&
      typeof d.percentage === "number" &&
      Number.isFinite(d.percentage)
  );
}

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
  // Validate data before rendering
  const validData = isValidData(data);

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={validData ? data : []}
      title="Participación de Causa Principal de Cancelación"
    >
      <div
        aria-label="Gráfico de dona mostrando la proporción de la causa principal de cancelación frente al resto de causas"
        role="img"
      >
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={95}
              dataKey="count"
              nameKey="category"
              paddingAngle={2}
              label={({ cx, cy, midAngle, outerRadius: or, percentage }: any) => {
                const RADIAN = Math.PI / 180;
                const radius = or + 20;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                return (
                  <text
                    x={x}
                    y={y}
                    fill="#374151"
                    textAnchor={x > cx ? "start" : "end"}
                    dominantBaseline="central"
                    fontSize={12}
                    fontWeight={600}
                  >
                    {formatPercent(percentage)}
                  </text>
                );
              }}
              labelLine={{ stroke: "#9ca3af", strokeWidth: 1 }}
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
                `${value.toLocaleString()} registros`,
                name,
              ]}
            />
            <Legend
              verticalAlign="bottom"
              iconType="square"
              iconSize={10}
              formatter={(value: string) =>
                value.length > 32 ? `${value.substring(0, 32)}…` : value
              }
              wrapperStyle={{ fontSize: "11px", paddingTop: "4px", lineHeight: "20px" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
