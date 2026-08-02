"use client";

import React from "react";

interface ChartWrapperProps {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  data?: unknown[];
  children: React.ReactNode;
  title?: string;
  className?: string;
}

/**
 * Wraps any chart with consistent loading, error, and empty state rendering.
 * - Loading: animated pulse skeleton
 * - Error: message with retry button
 * - Empty: "No hay datos con los filtros actuales"
 */
export function ChartWrapper({
  loading = false,
  error = null,
  onRetry,
  data,
  children,
  title,
  className = "",
}: ChartWrapperProps) {
  if (loading) {
    return (
      <div
        className={`rounded-lg border border-gray-200 bg-white p-4 ${className}`}
        aria-label={title ? `Cargando ${title}` : "Cargando gráfico"}
        role="status"
      >
        {title && (
          <div className="mb-3 h-5 w-48 animate-pulse rounded bg-gray-200" />
        )}
        <div className="flex h-64 items-center justify-center">
          <div className="w-full space-y-3">
            <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-4/6 animate-pulse rounded bg-gray-200" />
            <div className="h-32 w-full animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-white p-4 ${className}`}
        aria-label={title ? `Error en ${title}` : "Error en gráfico"}
        role="alert"
      >
        {title && (
          <h3 className="mb-2 text-sm font-medium text-gray-700">{title}</h3>
        )}
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <p className="text-sm text-red-600">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className={`rounded-lg border border-gray-200 bg-white p-4 ${className}`}
        aria-label={
          title
            ? `${title} - sin datos`
            : "Gráfico sin datos"
        }
      >
        {title && (
          <h3 className="mb-2 text-sm font-medium text-gray-700">{title}</h3>
        )}
        <div className="flex h-64 flex-col items-center justify-center gap-2">
          <svg
            className="h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <p className="text-sm text-gray-500">
            No hay datos con los filtros actuales
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-4 ${className}`}
    >
      {title && (
        <h3 className="mb-3 text-sm font-medium text-gray-700">{title}</h3>
      )}
      {children}
    </div>
  );
}
