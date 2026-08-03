"use client";

import React, { useState } from "react";
import { FileX2, ArrowRight, CheckCircle2, XCircle, Clock } from "lucide-react";

const STATES = [
  { key: "SOLICITADA", label: "Solicitada", color: "bg-gray-500" },
  { key: "EN_REVISION", label: "En Revisión", color: "bg-amber-500" },
  { key: "APROBADA", label: "Aprobada", color: "bg-emerald-500" },
  { key: "RECHAZADA", label: "Rechazada", color: "bg-red-500" },
  { key: "EN_EJECUCION", label: "En Ejecución", color: "bg-teal-500" },
  { key: "CERRADA", label: "Cerrada", color: "bg-slate-500" },
];

const DEMO_CASES = [
  { id: "ANU-2024-001", client: "María García", service: "Servihogar Plus", currentState: "CERRADA", date: "2024-10-15" },
  { id: "ANU-2024-002", client: "Carlos Rodríguez", service: "Gas Natural Residencial", currentState: "EN_EJECUCION", date: "2024-11-02" },
  { id: "ANU-2024-003", client: "Ana Martínez", service: "Servihogar Básico", currentState: "EN_REVISION", date: "2024-11-20" },
  { id: "ANU-2024-004", client: "Juan López", service: "Revisión Técnica", currentState: "APROBADA", date: "2024-12-01" },
  { id: "ANU-2024-005", client: "Laura Sánchez", service: "Servihogar Plus", currentState: "SOLICITADA", date: "2024-12-10" },
  { id: "ANU-2024-006", client: "Pedro Ramírez", service: "Gas Comercial", currentState: "RECHAZADA", date: "2024-12-12" },
];

function StateMachineViz() {
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-[800px] justify-center flex-wrap">
        {/* Main flow */}
        <StateNode label="SOLICITADA" color="bg-gray-500" />
        <ArrowRight size={16} className="text-gray-400 shrink-0" />
        <StateNode label="EN_REVISION" color="bg-amber-500" />
        <ArrowRight size={16} className="text-gray-400 shrink-0" />
        <div className="flex flex-col items-center gap-1">
          <StateNode label="APROBADA" color="bg-emerald-500" />
          <span className="text-[9px] text-gray-400">ó</span>
          <StateNode label="RECHAZADA" color="bg-red-500" />
        </div>
        <ArrowRight size={16} className="text-gray-400 shrink-0" />
        <StateNode label="EN_EJECUCION" color="bg-teal-500" />
        <ArrowRight size={16} className="text-gray-400 shrink-0" />
        <StateNode label="CERRADA" color="bg-slate-500" />
      </div>
    </div>
  );
}

function StateNode({ label, color }: { label: string; color: string }) {
  return (
    <div className={`${color} text-white text-[9px] font-bold px-2 py-1.5 rounded-md whitespace-nowrap`}>
      {label}
    </div>
  );
}

export default function AnulacionesPage() {
  const [formState, setFormState] = useState({
    clientName: "",
    service: "",
    reason: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
        Datos simulados exclusivamente para demostración conceptual.
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
          <FileX2 size={20} className="text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Máquina de Estados — Anulaciones</h1>
          <p className="text-sm text-gray-500">Flujo controlado de cancelación de servicios</p>
        </div>
      </div>

      {/* State Machine Visualization */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Flujo de Estados</h2>
        <StateMachineViz />
        <div className="mt-4 grid grid-cols-3 md:grid-cols-5 gap-2">
          {STATES.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${s.color}`} />
              <span className="text-[10px] text-gray-600">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Demo Form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Solicitud de Anulación (Demo)</h2>
        {submitted ? (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-lg p-4">
            <CheckCircle2 size={20} />
            <span className="text-sm font-medium">Solicitud registrada exitosamente. Estado: RECEIVED</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del Cliente</label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: María García"
                value={formState.clientName}
                onChange={(e) => setFormState({ ...formState, clientName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Servicio</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formState.service}
                onChange={(e) => setFormState({ ...formState, service: e.target.value })}
                required
              >
                <option value="">Seleccionar...</option>
                <option value="Servihogar Plus">Servihogar Plus</option>
                <option value="Servihogar Básico">Servihogar Básico</option>
                <option value="Gas Natural Residencial">Gas Natural Residencial</option>
                <option value="Gas Comercial">Gas Comercial</option>
                <option value="Revisión Técnica">Revisión Técnica</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo</label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: No utiliza el servicio"
                value={formState.reason}
                onChange={(e) => setFormState({ ...formState, reason: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-3">
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Registrar Solicitud
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Cases Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Casos de Anulación</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Servicio</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {DEMO_CASES.map((c) => {
                const stateInfo = STATES.find((s) => s.key === c.currentState);
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{c.id}</td>
                    <td className="px-4 py-3">{c.client}</td>
                    <td className="px-4 py-3 text-gray-600">{c.service}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block ${stateInfo?.color || "bg-gray-500"} text-white text-[10px] font-bold px-2 py-0.5 rounded`}>
                        {stateInfo?.label || c.currentState}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 italic text-center">
        Demostración conceptual del flujo. La lógica backend contiene validación de transiciones, roles y auditoría; esta interfaz no está conectada a sistemas productivos de Vanti.
      </p>
    </div>
  );
}
