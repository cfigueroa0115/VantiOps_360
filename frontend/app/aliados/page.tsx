"use client";

import React, { useState } from "react";
import { Users, CheckCircle2, Clock, FileText, AlertCircle } from "lucide-react";

export const ONBOARDING_STATES = [
  { key: "BORRADOR", label: "Borrador", order: 1 },
  { key: "ENVIADO", label: "Enviado", order: 2 },
  { key: "REVISION_LEGAL", label: "Revisión Legal", order: 3 },
  { key: "DEVUELTO_CORRECCION", label: "Devuelto para corrección", order: 3.5 },
  { key: "REVISION_VP", label: "Revisión VP", order: 4 },
  { key: "APROBADO", label: "Aprobado", order: 5 },
  { key: "RECHAZADO", label: "Rechazado", order: 5 },
  { key: "OPERATIVO", label: "Operativo", order: 6 },
];

const FLOW_STEPS = [
  { key: "BORRADOR", label: "Borrador" },
  { key: "ENVIADO", label: "Enviado" },
  { key: "REVISION_LEGAL", label: "Revisión Legal" },
  { key: "REVISION_VP", label: "Revisión VP" },
  { key: "APROBADO", label: "Aprobado" },
  { key: "OPERATIVO", label: "Operativo" },
];

const PARTNERS = [
  {
    id: 1,
    name: "TechServ Colombia SAS",
    nit: "900.123.456-7",
    service: "Mantenimiento domiciliario gas",
    status: "OPERATIVO",
    startDate: "2024-01-15",
    sla: "95%",
    score: 92,
  },
  {
    id: 2,
    name: "DataFlow Analytics",
    nit: "901.234.567-8",
    service: "Analítica y BI",
    status: "REVISION_VP",
    startDate: "2024-10-01",
    sla: "N/A",
    score: null,
  },
  {
    id: 3,
    name: "CloudOps Infrastructure",
    nit: "902.345.678-9",
    service: "Infraestructura cloud",
    status: "REVISION_LEGAL",
    startDate: "2024-11-10",
    sla: "N/A",
    score: null,
  },
  {
    id: 4,
    name: "Seguridad Integral LTDA",
    nit: "800.456.789-0",
    service: "Seguridad física y electrónica",
    status: "OPERATIVO",
    startDate: "2023-06-20",
    sla: "97%",
    score: 88,
  },
  {
    id: 5,
    name: "TransLog Express",
    nit: "903.567.890-1",
    service: "Logística y transporte",
    status: "DEVUELTO_CORRECCION",
    startDate: "2024-12-01",
    sla: "N/A",
    score: null,
  },
  {
    id: 6,
    name: "GreenEnergy Soluciones",
    nit: "904.678.901-2",
    service: "Energías alternativas",
    status: "RECHAZADO",
    startDate: "2025-01-05",
    sla: "N/A",
    score: null,
  },
];

export const TRACEABILITY_LOG = [
  {
    fecha: "2024-11-15",
    actor: "Camila Restrepo",
    rol: "LEGAL_APPROVER",
    decision: "Devuelto para corrección",
    comentario: "Falta cláusula de confidencialidad en el contrato.",
    estadoAnterior: "Revisión Legal",
    estadoNuevo: "Devuelto para corrección",
  },
  {
    fecha: "2024-11-22",
    actor: "Camila Restrepo",
    rol: "LEGAL_APPROVER",
    decision: "Aprobado Legal",
    comentario: "Contrato corregido y conforme.",
    estadoAnterior: "Revisión Legal",
    estadoNuevo: "Revisión VP",
  },
  {
    fecha: "2024-12-03",
    actor: "Andrés Villamil",
    rol: "VP_APPROVER",
    decision: "Rechazado",
    comentario: "No se justifica presupuestalmente para Q1 2025.",
    estadoAnterior: "Revisión VP",
    estadoNuevo: "Rechazado",
  },
];

function getStatusColor(status: string): string {
  switch (status) {
    case "BORRADOR": return "bg-gray-400";
    case "ENVIADO": return "bg-blue-400";
    case "REVISION_LEGAL": return "bg-amber-500";
    case "DEVUELTO_CORRECCION": return "bg-orange-500";
    case "REVISION_VP": return "bg-purple-500";
    case "APROBADO": return "bg-green-500";
    case "RECHAZADO": return "bg-red-500";
    case "OPERATIVO": return "bg-emerald-600";
    default: return "bg-gray-400";
  }
}

function StepperStatus({ currentStatus }: { currentStatus: string }) {
  const currentIdx = FLOW_STEPS.findIndex((s) => s.key === currentStatus);
  const isDevuelto = currentStatus === "DEVUELTO_CORRECCION";
  const isRechazado = currentStatus === "RECHAZADO";

  if (isDevuelto) {
    return (
      <span className="inline-block bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
        Devuelto para corrección
      </span>
    );
  }

  if (isRechazado) {
    return (
      <span className="inline-block bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
        Rechazado
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {FLOW_STEPS.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  isCompleted
                    ? "bg-green-500 text-white"
                    : isCurrent
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {isCompleted ? "✓" : i + 1}
              </div>
              <span className={`text-[8px] mt-0.5 ${isCurrent ? "text-blue-600 font-semibold" : "text-gray-400"}`}>
                {step.label}
              </span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`w-4 h-0.5 ${i < currentIdx ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function AliadosPage() {
  const [filter, setFilter] = useState<string>("ALL");

  const filteredPartners = filter === "ALL" ? PARTNERS : PARTNERS.filter((p) => p.status === filter);

  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
        Flujo conceptual con datos simulados. No conectado a procesos productivos de Vanti.
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
          <Users size={20} className="text-teal-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vantilisto Partners</h1>
          <p className="text-sm text-gray-500">Gestión de aliados estratégicos y onboarding</p>
        </div>
      </div>

      {/* Flow Description */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Flujo de Onboarding</h2>
        <p className="text-sm text-gray-600 mb-4">
          Secuencia obligatoria: Borrador → Enviado → Revisión Legal → Revisión VP → Aprobado → Operativo.
          Revisión VP sucede <strong>después</strong> de Revisión Legal.
        </p>
        <div className="flex items-center gap-1 flex-wrap" data-testid="flow-sequence">
          {FLOW_STEPS.map((step, i) => (
            <React.Fragment key={step.key}>
              <span className={`text-[10px] font-bold px-2 py-1 rounded ${getStatusColor(step.key)} text-white`}>
                {step.label}
              </span>
              {i < FLOW_STEPS.length - 1 && <span className="text-gray-400 text-xs">→</span>}
            </React.Fragment>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Estados adicionales: <strong>Devuelto para corrección</strong> (regresa desde Revisión Legal) y <strong>Rechazado</strong> (terminal, desde Revisión VP).
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{PARTNERS.length}</p>
          <p className="text-xs text-gray-500">Total Aliados</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-3xl font-bold text-green-700">{PARTNERS.filter((p) => p.status === "OPERATIVO").length}</p>
          <p className="text-xs text-green-600">Operativos</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
          <p className="text-3xl font-bold text-blue-700">{PARTNERS.filter((p) => ["REVISION_LEGAL", "REVISION_VP"].includes(p.status)).length}</p>
          <p className="text-xs text-blue-600">En Revisión</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-3xl font-bold text-red-700">{PARTNERS.filter((p) => ["RECHAZADO", "DEVUELTO_CORRECCION"].includes(p.status)).length}</p>
          <p className="text-xs text-red-600">Devueltos/Rechazados</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[{ key: "ALL", label: "Todos" }, ...ONBOARDING_STATES].map((step) => (
          <button
            key={step.key}
            onClick={() => setFilter(step.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              filter === step.key
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {step.label}
          </button>
        ))}
      </div>

      {/* Partners Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Aliado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">NIT</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Servicio</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado Onboarding</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">SLA</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPartners.map((partner) => (
                <tr key={partner.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{partner.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{partner.nit}</td>
                  <td className="px-4 py-3 text-gray-600">{partner.service}</td>
                  <td className="px-4 py-3">
                    <StepperStatus currentStatus={partner.status} />
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{partner.sla}</td>
                  <td className="px-4 py-3 text-center">
                    {partner.score !== null ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        partner.score >= 90 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {partner.score}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Traceability Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Trazabilidad de Decisiones</h2>
          <p className="text-xs text-gray-500 mt-1">Registros simulados de auditoría de aprobaciones.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="traceability-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Rol</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Decisión</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Comentario</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Estado anterior</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Estado nuevo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {TRACEABILITY_LOG.map((entry, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{entry.fecha}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{entry.actor}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs font-mono">{entry.rol}</td>
                  <td className="px-4 py-3 text-gray-800">{entry.decision}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px]">{entry.comentario}</td>
                  <td className="px-4 py-3 text-gray-500">{entry.estadoAnterior}</td>
                  <td className="px-4 py-3 text-gray-800 font-medium">{entry.estadoNuevo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 italic text-center" data-testid="disclaimer">
        Flujo conceptual con datos simulados. No conectado a procesos productivos de Vanti.
      </p>
    </div>
  );
}
