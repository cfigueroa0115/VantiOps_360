"use client";

import React from "react";
import { Radio, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

interface KPI {
  label: string;
  value: string | number;
  target: string;
  unit: string;
  status: "green" | "amber" | "red";
  trend: "up" | "down" | "stable";
}

const KPIS: KPI[] = [
  { label: "ANS Cumplimiento", value: "65%", target: "≥ 90%", unit: "", status: "red", trend: "down" },
  { label: "Demanda Mensual", value: 1240, target: "≤ 1000", unit: "PQR", status: "red", trend: "up" },
  { label: "Backlog Actual", value: 387, target: "≤ 100", unit: "casos", status: "red", trend: "up" },
  { label: "Capacidad Instalada", value: "78%", target: "≤ 85%", unit: "", status: "amber", trend: "stable" },
  { label: "Productividad", value: "12.3", target: "≥ 15", unit: "casos/día/agente", status: "amber", trend: "up" },
  { label: "Calidad de Datos", value: "87.3%", target: "≥ 95%", unit: "", status: "amber", trend: "up" },
];

const SEMAPHORE_CONFIG = {
  green: { bg: "bg-green-100", border: "border-green-300", text: "text-green-800", dot: "bg-green-500", label: "En meta" },
  amber: { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800", dot: "bg-amber-500", label: "En riesgo" },
  red: { bg: "bg-red-100", border: "border-red-300", text: "text-red-800", dot: "bg-red-500", label: "Crítico" },
};

const OPERATIONAL_AREAS = [
  { area: "Gas Residencial", demand: 520, capacity: 450, backlog: 145, ans: 62, status: "red" as const },
  { area: "Gas Comercial", demand: 180, capacity: 200, backlog: 32, ans: 88, status: "amber" as const },
  { area: "Servihogar", demand: 340, capacity: 280, backlog: 156, ans: 55, status: "red" as const },
  { area: "Revisión Técnica", demand: 120, capacity: 150, backlog: 28, ans: 92, status: "green" as const },
  { area: "Facturación", demand: 80, capacity: 100, backlog: 26, ans: 85, status: "amber" as const },
];

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp size={14} />;
  if (trend === "down") return <TrendingDown size={14} />;
  return <Minus size={14} />;
}

export default function OperacionesPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
        Datos simulados exclusivamente para demostración conceptual.
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100">
          <Radio size={20} className="text-rose-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Torre de Control — Operaciones</h1>
          <p className="text-sm text-gray-500">Simulación basada en contexto del assessment</p>
        </div>
      </div>

      {/* Assessment Context */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Contexto Operacional del Assessment</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-white rounded-lg p-3 border border-slate-100">
            <p className="text-2xl font-bold text-slate-900">12</p>
            <p className="text-slate-600">Personas internas</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-slate-100">
            <p className="text-2xl font-bold text-slate-900">20</p>
            <p className="text-slate-600">Contratistas</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-slate-100">
            <p className="text-2xl font-bold text-slate-900">10</p>
            <p className="text-slate-600">Negocios soportados</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-slate-100">
            <p className="text-2xl font-bold text-amber-700">65%</p>
            <p className="text-slate-600">ANS actual</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs text-slate-600">
          <div className="flex items-start gap-2">
            <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
            <span>~2.000 correos/mes gestionados manualmente</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
            <span>Cambio próximo del contratista de Back Office</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
            <span>Procesos manuales en SAP</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
            <span>3 ingenieros nuevos con menos de 2 meses</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-[10px] text-slate-500 font-medium">Capacidades tecnológicas propuestas:</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {["SAP GUI Scripting", "Power Automate", "R", "Automatización", "Analítica"].map((cap) => (
              <span key={cap} className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-600">
                {cap}
              </span>
            ))}
          </div>
          <p className="text-[9px] text-slate-400 mt-1 italic">Propuesta de evolución — no implementado en producción actualmente</p>
        </div>
      </div>

      {/* Semaphore Legend */}
      <div className="flex items-center gap-4">
        {(["green", "amber", "red"] as const).map((status) => {
          const config = SEMAPHORE_CONFIG[status];
          return (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${config.dot}`} />
              <span className="text-xs text-gray-600">{config.label}</span>
            </div>
          );
        })}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {KPIS.map((kpi) => {
          const config = SEMAPHORE_CONFIG[kpi.status];
          return (
            <div key={kpi.label} className={`rounded-xl border ${config.border} ${config.bg} p-5`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">{kpi.label}</p>
                <div className={`flex items-center gap-1 ${config.text}`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${config.dot} animate-pulse`} />
                  <TrendIcon trend={kpi.trend} />
                </div>
              </div>
              <p className={`text-3xl font-bold ${config.text}`}>
                {kpi.value}
                {kpi.unit && <span className="text-sm font-normal ml-1">{kpi.unit}</span>}
              </p>
              <p className="text-[10px] text-gray-500 mt-1">Meta: {kpi.target}</p>
            </div>
          );
        })}
      </div>

      {/* Alert Banner */}
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
        <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-800 text-sm">Alerta Operativa</p>
          <p className="text-xs text-red-700 mt-1">
            ANS por debajo del objetivo (65% vs 90% meta). Backlog acumulado en áreas de Servihogar y Gas Residencial. 
            Se recomienda activar war room y plan de contingencia inmediato.
          </p>
        </div>
      </div>

      {/* Area Breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Desglose por Área Operativa</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Área</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Demanda</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Capacidad</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Backlog</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">ANS</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {OPERATIONAL_AREAS.map((area) => {
                const config = SEMAPHORE_CONFIG[area.status];
                return (
                  <tr key={area.area} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{area.area}</td>
                    <td className="px-4 py-3 text-right">{area.demand}</td>
                    <td className="px-4 py-3 text-right">{area.capacity}</td>
                    <td className="px-4 py-3 text-right font-medium">{area.backlog}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${config.bg} ${config.text}`}>
                        {area.ans}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${config.bg}`}>
                        <div className={`w-2 h-2 rounded-full ${config.dot}`} />
                        <span className={`text-[10px] font-semibold ${config.text}`}>{config.label}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Capacity Utilization Bars */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Utilización de Capacidad</h2>
        <div className="space-y-3">
          {OPERATIONAL_AREAS.map((area) => {
            const utilization = Math.round((area.demand / area.capacity) * 100);
            const config = SEMAPHORE_CONFIG[area.status];
            return (
              <div key={area.area} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-700">{area.area}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${config.dot}`}
                    style={{ width: `${Math.min(utilization, 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-10 text-right ${config.text}`}>{utilization}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 italic text-center">
        Indicadores simulados para demostración del modelo de torre de control.
      </p>
    </div>
  );
}
