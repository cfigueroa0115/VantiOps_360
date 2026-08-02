"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface DateRangePickerProps {
  /** Current start date in YYYY-MM-DD format */
  startDate?: string;
  /** Current end date in YYYY-MM-DD format */
  endDate?: string;
  /** Called when either date changes with {start, end} */
  onChange: (range: { start: string; end: string } | undefined) => void;
  /** Additional class names */
  className?: string;
}

/**
 * DateRangePicker — Two native HTML date inputs (start/end) styled with Tailwind.
 * Emits undefined when both dates are cleared.
 */
export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  className,
}: DateRangePickerProps) {
  function handleStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    const start = e.target.value;
    if (!start && !endDate) {
      onChange(undefined);
    } else {
      onChange({ start: start || "", end: endDate || "" });
    }
  }

  function handleEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    const end = e.target.value;
    if (!end && !startDate) {
      onChange(undefined);
    } else {
      onChange({ start: startDate || "", end: end || "" });
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-gray-700">Periodo</label>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-12">Desde</span>
          <input
            type="date"
            value={startDate || ""}
            onChange={handleStartChange}
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm
                       focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="Fecha inicio"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-12">Hasta</span>
          <input
            type="date"
            value={endDate || ""}
            onChange={handleEndChange}
            min={startDate || undefined}
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm
                       focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="Fecha fin"
          />
        </div>
      </div>
    </div>
  );
}
