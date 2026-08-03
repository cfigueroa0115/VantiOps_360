"use client";

import React from "react";
import { CalendarDays, Shield, Cog, Rocket, CheckCircle2, Circle } from "lucide-react";

interface Phase {
  title: string;
  days: string;
  color: string;
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
  objective: string;
  deliverables: { item: string; done: boolean }[];
}

const PHASES: Phase[] = [
  {
    title: "Estabilizar",
    days: "0–30 días",
    color: "text-red-700",
    borderColor: "border-red-200",
    bgColor: "bg-red-50",
    icon: <Shield size={20} className="text-red-600" />,
    objective: "Contener la crisis operativa, reducir backlog y establecer visibilidad",
    deliverables: [
      { item: "War Room diario con métricas de backlog y ANS", done: true },
      { item: "Inventario completo de PQR abiertas (600 registros)", done: true },
      { item: "Priorización de backlog por severidad y antigüedad", done: true },
      { item: "Dashboard operativo en tiempo real", done: true },
      { item: "Modelo de riesgo para predicción de incumplimiento", done: true },
      { item: "Quick wins: cierre de casos resolubles inmediatamente", done: false },
      { item: "Análisis de causa raíz principal (Servihogar)", done: true },
      { item: "Plan de comunicación con áreas afectadas", done: false },
    ],
  },
  {
    title: "Estandarizar",
    days: "31–60 días",
    color: "text-amber-700",
    borderColor: "border-amber-200",
    bgColor: "bg-amber-50",
    icon: <Cog size={20} className="text-amber-600" />,
    objective: "Implementar procesos estándar, entrenar equipos y pilotar automatización",
    deliverables: [
      { item: "SOPs documentados para gestión de PQR", done: false },
      { item: "Capacitación en nuevo sistema de gestión", done: false },
      { item: "Piloto de automatización de routing inteligente", done: false },
      { item: "Definición de SLAs internos por tipo de caso", done: false },
      { item: "Protocolo de retención pre-cancelación", done: false },
      { item: "Integración de calidad de datos en flujo operativo", done: false },
      { item: "Tablero de gestión por excepción (alertas)", done: false },
      { item: "Evaluación de proveedores para outsourcing selectivo", done: false },
    ],
  },
  {
    title: "Escalar",
    days: "61–90 días",
    color: "text-green-700",
    borderColor: "border-green-200",
    bgColor: "bg-green-50",
    icon: <Rocket size={20} className="text-green-600" />,
    objective: "Automatizar procesos clave, formar células especializadas y mejora continua",
    deliverables: [
      { item: "Automatización de 40% de casos de bajo riesgo", done: false },
      { item: "Células especializadas por tipo de servicio", done: false },
      { item: "Modelo de mejora continua (PDCA) implementado", done: false },
      { item: "Canales digitales de autoservicio activos", done: false },
      { item: "Scoring predictivo integrado en workflow", done: false },
      { item: "Reducción de ANS de 65% a 85% objetivo", done: false },
      { item: "Onboarding de aliados estratégicos completado", done: false },
      { item: "Roadmap de automatización a 6 meses definido", done: false },
    ],
  },
];

export default function Plan306090Page() {
  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
        Datos simulados exclusivamente para demostración conceptual.
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
          <CalendarDays size={20} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan 30-60-90</h1>
          <p className="text-sm text-gray-500">Roadmap de estabilización, estandarización y escalamiento</p>
        </div>
      </div>

      {/* Timeline Visual */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs text-gray-600">Estabilizar</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-xs text-gray-600">Estandarizar</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs text-gray-600">Escalar</span>
            </div>
          </div>
        </div>
        {/* Timeline bar */}
        <div className="relative h-12 flex rounded-full overflow-hidden border border-gray-200">
          <div className="flex-1 bg-red-100 flex items-center justify-center border-r border-red-200">
            <span className="text-xs font-bold text-red-700">0–30 días</span>
          </div>
          <div className="flex-1 bg-amber-100 flex items-center justify-center border-r border-amber-200">
            <span className="text-xs font-bold text-amber-700">31–60 días</span>
          </div>
          <div className="flex-1 bg-green-100 flex items-center justify-center">
            <span className="text-xs font-bold text-green-700">61–90 días</span>
          </div>
        </div>
        {/* Current position indicator */}
        <div className="mt-2 flex">
          <div className="w-1/3 flex justify-center">
            <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full">← Secuencia recomendada</span>
          </div>
        </div>
      </div>

      {/* Phase Cards */}
      <div className="space-y-6">
        {PHASES.map((phase, phaseIdx) => (
          <div key={phase.days} className={`rounded-xl border-2 ${phase.borderColor} ${phase.bgColor} p-6`}>
            <div className="flex items-center gap-3 mb-4">
              {phase.icon}
              <div>
                <h2 className={`text-xl font-bold ${phase.color}`}>{phase.title}</h2>
                <p className="text-sm text-gray-600">{phase.days}</p>
              </div>
              <span className={`ml-auto text-xs font-medium px-3 py-1 rounded-full border ${phase.borderColor} ${phase.color}`}>
                {phase.deliverables.length} entregables propuestos
              </span>
            </div>
            <p className="text-sm text-gray-700 mb-4 italic">&ldquo;{phase.objective}&rdquo;</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {phase.deliverables.map((del, i) => (
                <div key={i} className="flex items-start gap-2 bg-white/60 rounded-lg px-3 py-2 border border-white/80">
                  <Circle size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-gray-700">{del.item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Success Metrics */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Métricas de Éxito al Día 90</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "ANS", current: "65%", target: "85%", icon: "📊" },
            { label: "Backlog", current: "387", target: "< 50", icon: "📋" },
            { label: "Automatización", current: "0%", target: "40%", icon: "🤖" },
            { label: "Calidad Datos", current: "87%", target: "95%", icon: "✅" },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-gray-100 p-4 text-center">
              <p className="text-2xl mb-1">{m.icon}</p>
              <p className="text-xs font-medium text-gray-500">{m.label}</p>
              <p className="text-sm">
                <span className="text-red-600 font-medium">{m.current}</span>
                <span className="text-gray-400 mx-1">→</span>
                <span className="text-green-600 font-bold">{m.target}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
