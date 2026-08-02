"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KPIFormatType = "number" | "days" | "percentage";

export interface KPICardProps {
  /** Display label for the KPI */
  label: string;
  /** Raw numeric value; undefined triggers loading skeleton */
  value: number | undefined;
  /** Format type determines how the value is displayed */
  format: KPIFormatType;
  /** Optional icon rendered beside the label */
  icon?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Format a KPI value based on type.
 * - "days": 1 decimal + " días"
 * - "percentage": 1 decimal + "%"
 * - "number": locale-aware integer with thousands separator
 */
function formatKPIValue(value: number, format: KPIFormatType): string {
  switch (format) {
    case "days":
      return `${value.toFixed(1)} días`;
    case "percentage":
      return `${value.toFixed(1)}%`;
    case "number":
      return Math.round(value).toLocaleString("es-CO");
  }
}

/**
 * Individual KPI card component displaying a value with its label and
 * proper formatting. Shows a loading skeleton when value is undefined.
 */
export function KPICard({ label, value, format, icon, className }: KPICardProps) {
  const isLoading = value === undefined;

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {icon && (
            <span className="text-muted-foreground" aria-hidden="true">
              {icon}
            </span>
          )}
          <p className="text-sm font-medium text-muted-foreground truncate">
            {label}
          </p>
        </div>

        {isLoading ? (
          <div className="h-8 w-24 rounded bg-muted animate-pulse" aria-label="Cargando..." />
        ) : (
          <p className="text-2xl font-bold tracking-tight" aria-label={`${label}: ${formatKPIValue(value, format)}`}>
            {formatKPIValue(value, format)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
