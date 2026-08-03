"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">VantiOps 360</h1>
          <p className="text-gray-600 mb-6">
            Se presentó un error crítico en la aplicación. Por favor intenta recargar.
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Recargar aplicación
          </button>
          <p className="mt-6 text-xs text-gray-400">
            Desarrollado por el Ing. Carlos Alberto Figueroa Martínez
          </p>
        </div>
      </body>
    </html>
  );
}
