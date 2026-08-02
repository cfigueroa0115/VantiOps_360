"use client";

import React from "react";
import { Filter, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HeaderProps {
  /** Number of currently active filters */
  activeFilterCount?: number;
  /** Last updated timestamp string */
  lastUpdated?: string;
  /** Additional class names */
  className?: string;
}

/**
 * Top header bar displaying the dashboard title, active filters count badge,
 * and last updated timestamp.
 * (Req 5.3: Page header with title and filters summary)
 */
export function Header({
  activeFilterCount = 0,
  lastUpdated,
  className,
}: HeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4",
        className,
      )}
    >
      {/* Title */}
      <div>
        <h1 className="text-lg font-bold text-gray-900">
          VantiOps 360 — Panel Ejecutivo PQR
        </h1>
        <p className="text-sm text-gray-500">
          Análisis operativo de Peticiones, Quejas y Reclamos
        </p>
      </div>

      {/* Right section: active filters badge + last updated */}
      <div className="flex items-center gap-4">
        {/* Active filters badge */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5">
            <Filter size={14} className="text-blue-600" />
            <span className="text-xs font-medium text-blue-700">
              {activeFilterCount} filtro{activeFilterCount !== 1 ? "s" : ""} activo{activeFilterCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Last updated timestamp */}
        {lastUpdated && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock size={14} />
            <span>Actualizado: {lastUpdated}</span>
          </div>
        )}
      </div>
    </header>
  );
}
