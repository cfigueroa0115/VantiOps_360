"use client";

import { useEffect } from "react";
import { FILTER_SESSION_KEY } from "@/hooks/useFilters";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[VantiOps 360] Page error:", error.message);
  }, [error]);

  function handleResetFilters() {
    try {
      sessionStorage.removeItem(FILTER_SESSION_KEY);
    } catch {
      // Ignore
    }
    window.location.reload();
  }

  return (
    <div data-testid="page-error-view" className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        Se presentó un error inesperado
      </h2>
      <p className="text-sm text-gray-600 mb-6 max-w-md">
        La página no pudo cargarse correctamente. Esto puede deberse a una
        incompatibilidad temporal de datos o una falla de conexión.
      </p>
      <div className="flex flex-col gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Reintentar
        </button>
        <button
          onClick={handleResetFilters}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Restablecer filtros y reintentar
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Esta acción solo restablece los filtros guardados en este navegador.
      </p>
      <p className="mt-4 text-xs text-gray-400">
        Desarrollado por el Ing. Carlos Alberto Figueroa Martínez
      </p>
    </div>
  );
}
