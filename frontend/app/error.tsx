"use client";

import { useEffect } from "react";

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

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        Se presentó un error inesperado
      </h2>
      <p className="text-sm text-gray-600 mb-6 max-w-md">
        La página no pudo cargarse correctamente. Esto puede deberse a una
        incompatibilidad temporal de datos o una falla de conexión.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Reintentar
      </button>
      <p className="mt-4 text-xs text-gray-400">
        Desarrollado por el Ing. Carlos Alberto Figueroa Martínez
      </p>
    </div>
  );
}
