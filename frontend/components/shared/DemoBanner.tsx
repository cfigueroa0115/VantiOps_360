"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-800">
            ⚠️ Datos simulados exclusivamente para demostración conceptual
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            Prototipo conceptual para validación de experiencia y arquitectura. No conectado con sistemas productivos de Vanti.
          </p>
        </div>
      </div>
    </div>
  );
}
