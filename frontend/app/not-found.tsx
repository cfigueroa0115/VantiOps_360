"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertCircle size={32} className="text-red-500" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Página no encontrada</h2>
        <p className="text-sm text-gray-500 mb-8">
          La página que buscas no existe o ha sido movida. Verifica la URL o regresa al dashboard principal.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Home size={16} />
          Volver al Dashboard
        </Link>
      </div>
    </div>
  );
}
