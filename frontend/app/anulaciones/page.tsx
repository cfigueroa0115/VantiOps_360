"use client";

import React, { useState } from "react";
import { FileX2, ArrowRight, CheckCircle2 } from "lucide-react";

const STATES = [
  { key: "SOLICITADA", label: "Solicitada", color: "bg-gray-500", terminal: false },
  { key: "EN_REVISION", label: "En Revisión", color: "bg-amber-500", terminal: false },
  { key: "APROBADA", label: "Aprobada", color: "bg-emerald-500", terminal: false },
  { key: "RECHAZADA", label: "Rechazada", color: "bg-red-500", terminal: true },
  { key: "EN_EJECUCION", label: "En Ejecución", color: "bg-teal-500", terminal: false },
  { key: "CERRADA", label: "Cerrada", color: "bg-slate-500", terminal: true },
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
      <div className="flex flex-col items-center gap-4 min-w-[600px]">
        {/* Main happy path: Solicitada → En Revisión → Aprobada → En Ejecución → Cerrada */}
        <div className="flex items-center gap-2 justify-center">
          <StateNode label="Solicitada" color="bg-gray-500" />
          <ArrowRight size={16} className="text-gray-400 shrink-0" />
          <StateNode label="En Revisión" color="bg-amber-500" />
          <ArrowRight size={16} className="text-gray-400 shrink-0" />
          <StateNode label="Aprobada" color="bg-emerald-500" />
          <ArrowRight size={16} className="text-gray-400 shrink-0" />
          <StateNode label="En Ejecución" color="bg-teal-500" />
          <ArrowRight size={16} className="text-gray-400 shrink-0" />
          <StateNode label="Cerrada" color="bg-slate-500" terminal />
        </div>
        {/* Rejection branch from En Revisión */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 mr-1">Desde &quot;En Revisión&quot;:</span>
          <ArrowRight size={16} className="text-red-300 shrink-0" />
          <StateNode label="Rechazada" color="bg-red-500" terminal />
          <span className="text-[10px] text-gray-500 ml-2">(estado terminal)</span>
        </div>
      </div>
    </div>
  );
}

function StateNode({ label, color, terminal }: { label: string; color: string; terminal?: boolean }) {
  return (
    <div className={`${color} text-white text-[10px] font-bold px-2.5 py-1.5 rounded-md whitespace-nowrap ${terminal ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}>
      {label}
    </div>
  );
}

export default function AnulacionesPage() {
  const [formState, setFormState] = useState({
    partnerId: "",
    senderEmail: "",
    pqrId: "",
    justification: "",
  });
  const [result, setResult] = useState<{ type: "success" | "error"; message: string; radicado?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/annulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: formState.partnerId,
          senderEmail: formState.senderEmail,
          pqrId: formState.pqrId,
          justification: formState.justification,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult({ type: "success", message: `Solicitud radicada exitosamente. Estado: Solicitada`, radicado: data.data?.radicado });
        setFormState({ partnerId: "", senderEmail: "", pqrId: "", justification: "" });
      } else if (res.status === 401 || res.status === 403) {
        const msg = data.error?.message || "Acceso no autorizado";
        setResult({ type: "error", message: `Acceso denegado: ${msg}` });
      } else if (res.status === 422) {
        setResult({ type: "error", message: `Transición no válida: ${data.error?.message || "Estado no permite esta operación"}` });
      } else {
        const msg = data.error?.message || "Error en la solicitud";
        setResult({ type: "error", message: msg });
      }
    } catch (err) {
      setResult({ type: "error", message: "Error de red. Verifique conectividad." });
    } finally {
      setLoading(false);
    }
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
        <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-2">
          {STATES.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${s.color}`} />
              <span className="text-[10px] text-gray-600">
                {s.label}{s.terminal ? " ●" : ""}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-700 font-medium" data-testid="terminal-states-note">
          Los estados Rechazada y Cerrada son terminales.
        </p>
      </div>

      {/* Solicitud Form — Connected to API */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Solicitud de Anulación (POC)</h2>
        {result && (
          <div className={`flex items-center gap-2 mb-4 rounded-lg p-4 border ${
            result.type === "success" ? "text-green-600 bg-green-50 border-green-200" : "text-red-600 bg-red-50 border-red-200"
          }`}>
            {result.type === "success" ? <CheckCircle2 size={20} /> : <FileX2 size={20} />}
            <div>
              <span className="text-sm font-medium">{result.message}</span>
              {result.radicado && <p className="text-xs mt-0.5 font-mono">{result.radicado}</p>}
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Partner ID</label>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="UUID del aliado"
              value={formState.partnerId}
              onChange={(e) => setFormState({ ...formState, partnerId: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Correo Remitente</label>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="correo@aliado.co"
              value={formState.senderEmail}
              onChange={(e) => setFormState({ ...formState, senderEmail: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">PQR / Referencia</label>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="PQR-001"
              value={formState.pqrId}
              onChange={(e) => setFormState({ ...formState, pqrId: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Justificación (mín. 10 caracteres)</label>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Motivo detallado de la solicitud"
              value={formState.justification}
              onChange={(e) => setFormState({ ...formState, justification: e.target.value })}
              required
              minLength={10}
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2 text-white text-sm font-medium rounded-lg transition-colors ${
                loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Procesando..." : "Radicar Solicitud"}
            </button>
          </div>
        </form>
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
        Simulación del canal de entrada. La persistencia y transición protegida requiere identidad autenticada (JWT).
        En una implementación productiva, el remitente se obtendría del canal confiable de email/API,
        no de un campo definido por el cliente. Prototipo independiente — no conectado a sistemas productivos de Vanti.
      </p>
    </div>
  );
}
