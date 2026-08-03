"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldAlert, Home } from "lucide-react";

/**
 * Access Denied page.
 *
 * Displayed when the RBAC middleware redirects a user who does not have
 * the required role for a protected route. Shows:
 * - What page was attempted (from the `from` query param)
 * - A descriptive message explaining insufficient permissions
 * - A link back to the dashboard
 * - Instructions to contact SYSTEM_ADMIN for role assignment
 *
 * Requirements: REQ-13.3, REQ-13.6
 */
export default function AccessDeniedPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh] p-6">Cargando...</div>}>
      <AccessDeniedContent />
    </Suspense>
  );
}

function AccessDeniedContent() {
  const searchParams = useSearchParams();
  const attemptedPath = searchParams.get("from");

  return (
    <div
      className="flex items-center justify-center min-h-[60vh] p-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <ShieldAlert size={32} className="text-red-500" aria-hidden="true" />
          </div>
        </div>

        <h1 className="text-4xl font-bold text-gray-900 mb-2">403</h1>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">
          Acceso Denegado
        </h2>

        <p className="text-sm text-gray-500 mb-4">
          No tienes permisos suficientes para acceder a este recurso.
          Tu rol actual no incluye autorización para esta funcionalidad.
        </p>

        {attemptedPath && (
          <p className="text-xs text-gray-400 mb-4" aria-label="Ruta solicitada">
            Ruta solicitada:{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
              {attemptedPath}
            </code>
          </p>
        )}

        <p className="text-xs text-gray-400 mb-8">
          Si crees que deberías tener acceso, contacta al administrador del sistema
          (SYSTEM_ADMIN) para obtener un rol adecuado.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Volver al Dashboard principal"
        >
          <Home size={16} aria-hidden="true" />
          Volver al Dashboard
        </Link>
      </div>
    </div>
  );
}
