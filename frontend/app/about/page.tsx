"use client";

import React from "react";
import { Info, ExternalLink, Shield, Code2, Database, LayoutDashboard } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
          <Info size={20} className="text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acerca de VantiOps 360</h1>
          <p className="text-sm text-gray-500">Control Tower de Operaciones, Datos y Aliados Estratégicos</p>
        </div>
      </div>

      {/* Main Description */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-8 text-center">
        <LayoutDashboard size={40} className="text-blue-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-blue-900 mb-3">VantiOps 360</h2>
        <p className="text-blue-800 max-w-2xl mx-auto leading-relaxed">
          Control Tower de Operaciones, Datos y Aliados Estratégicos. Prototipo conceptual para validación 
          de experiencia y arquitectura. No conectado con sistemas productivos de Vanti.
        </p>
      </div>

      {/* Purpose */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Propósito</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          VantiOps 360 es un prototipo funcional diseñado para demostrar capacidades de arquitectura de datos, 
          analítica avanzada y gestión operativa en el contexto de PQR (Peticiones, Quejas y Reclamos) del sector 
          de servicios públicos. El sistema integra un pipeline completo de calidad de datos, modelo predictivo de 
          riesgo y análisis de causa raíz.
        </p>
      </div>

      {/* Capabilities */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Capacidades Demostradas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: <Database size={16} className="text-blue-600" />, title: "Data Engineering", description: "Pipeline ETL completo: ingesta, profiling, calidad, enriquecimiento" },
            { icon: <Code2 size={16} className="text-purple-600" />, title: "Full-Stack Development", description: "Frontend React + Backend Python + PostgreSQL" },
            { icon: <Shield size={16} className="text-green-600" />, title: "Data Quality", description: "6 dimensiones ISO 25012, scoring automático, acciones correctivas" },
            { icon: <LayoutDashboard size={16} className="text-indigo-600" />, title: "Analytics & ML", description: "Modelo de riesgo, análisis RCA, métricas operativas" },
          ].map((cap) => (
            <div key={cap.title} className="flex gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
              <div className="shrink-0 mt-0.5">{cap.icon}</div>
              <div>
                <p className="text-sm font-medium text-gray-800">{cap.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{cap.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scope */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Alcance del Prototipo</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 rounded-lg bg-green-50 border border-green-200">
            <p className="font-semibold text-green-800 mb-1">Fase 1 — Datos Reales</p>
            <p className="text-xs text-green-700">Dashboard, Calidad, Riesgo, Causa Raíz. Pipeline completo con 600+ registros reales procesados.</p>
          </div>
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
            <p className="font-semibold text-blue-800 mb-1">Fase 2 — Conceptual</p>
            <p className="text-xs text-blue-700">Arquitectura, Aliados, Anulaciones, Migración. Diseños de solución y flujos propuestos.</p>
          </div>
          <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
            <p className="font-semibold text-purple-800 mb-1">Fase 3 — Simulado</p>
            <p className="text-xs text-purple-700">Operaciones, Plan 30-60-90, Proveedores. Datos sintéticos para demostración de capacidades.</p>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-800 mb-2">Aviso Importante</h2>
        <p className="text-sm text-amber-700 leading-relaxed">
          VantiOps 360 es un prototipo independiente desarrollado por Carlos Alberto Figueroa Martínez como
          respuesta a una prueba técnica. No es un producto oficial de Vanti ni está conectado a sistemas
          productivos de la compañía. La Fase 1 utiliza la base suministrada exclusivamente para el assessment,
          presentada mediante análisis agregados. Las Fases 2 y 3 utilizan datos sintéticos o diseños conceptuales
          claramente identificados.
        </p>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 pt-4">
        <p>VantiOps 360 — Versión Prototipo 1.0</p>
        <p className="mt-1">Construido con Next.js, FastAPI, PostgreSQL y ❤️</p>
      </div>
    </div>
  );
}
