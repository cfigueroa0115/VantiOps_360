"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type KPIFormatType = "number" | "days" | "percentage";

export interface KPICardProps {
  label: string;
  value: number | undefined;
  format: KPIFormatType;
  icon?: React.ReactNode;
  className?: string;
}

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
 * Animated counter that counts up from 0 to value on mount/change.
 */
function AnimatedValue({ value, format }: { value: number; format: KPIFormatType }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const prevRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    const duration = 800;
    startRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  return (
    <span aria-label={`${formatKPIValue(value, format)}`}>
      {formatKPIValue(display, format)}
    </span>
  );
}

export function KPICard({ label, value, format, icon, className }: KPICardProps) {
  const isLoading = value === undefined;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4",
        "transition-all duration-300 ease-out",
        "hover:scale-[1.02] hover:-translate-y-1",
        "hover:shadow-lg hover:shadow-blue-500/10",
        "hover:border-blue-300",
        className,
      )}
    >
      {/* Animated gradient border glow on hover */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(147,51,234,0.05) 50%, rgba(6,182,212,0.08) 100%)",
        }}
      />

      {/* Shimmer sweep on hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_ease-in-out] overflow-hidden rounded-xl">
        <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          {icon && (
            <span className="text-gray-400 transition-colors duration-300 group-hover:text-blue-500" aria-hidden="true">
              {icon}
            </span>
          )}
          <p className="text-sm font-medium text-gray-500 truncate transition-colors duration-300 group-hover:text-gray-700">
            {label}
          </p>
        </div>

        {isLoading ? (
          <div className="h-8 w-24 rounded-md bg-gray-100 animate-pulse" aria-label="Cargando..." />
        ) : (
          <p className="text-2xl font-bold tracking-tight text-gray-900 transition-colors duration-300 group-hover:text-blue-900">
            <AnimatedValue value={value} format={format} />
          </p>
        )}
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 transition-all duration-500 ease-out group-hover:w-full" />
    </div>
  );
}
