"use client";

import React, { useState } from "react";
import { Users, CheckCircle2, Clock, FileText, AlertCircle } from "lucide-react";

const ONBOARDING_STEPS = [
  { key: "DRAFT", label: "Borrador" },
  { key: "SUBMITTED", label: "Enviado" },
  { key: "LEGAL_REVIEW", label: "Revisión Legal" },
  { key: "VP_REVIEW", label: "Revisión VP" },
  { key: "OPERATIONAL", label: "Operativo" },
];

const PARTNERS = [
  {
    id: 1,
    name: "TechServ Colombia SAS",
    nit: "900.123.456-7",
    service: "Mantenimiento domiciliario gas",
    status: "OPERATIONAL",
    startDate: "2024-01-15",
    sla: "95%",
    score: 92,
  },
  {
    id: 2,
    name: "DataFlow Analytics",
    nit: "901.234.567-8",
    service: "Analítica y BI",
    status: "VP_REVIEW",
    startDate: "2024-10-01",
    sla: "N/A",
    score: null,
  },
  {
    id: 3,
    name: "CloudOps Infrastructure",
    nit: "902.345.678-9",
    service: "Infraestructura cloud",
    status: "LEGAL_REVIEW",
    startDate: "2024-11-10",
    sla: "N/A",
    score: null,
  },
  {
    id: 4,
    name: "Seguridad Integral LTDA",
    nit: "800.456.789-0",
    service: "Seguridad física y electrónica",
    status: "OPERATIONAL",
    startDate: "2023-06-20",
    sla: "97%",
    score: 88,
  },
  {
    id: 5,
    name: "TransLog Express",
    nit: "903.567.890-1",
    service: "Logística y transporte",
    status: "SUBMITTED",
    startDate: "2024-12-01",
    sla: "N/A",
    score: null,
  },
  {
    id: 6,
    name: "GreenEnergy Soluciones",
    nit: "904.678.901-2",
    service: "Energías alternativas",
    status: "DRAFT",
    startDate: "2025-01-05",
    sla: "N/A",
    score: null,
  },
];

function StepperStatus({ currentStatus }: { currentStatus: string }) {
  const currentIdx = ONBOARDING_STEPS.findIndex((s) => s.key === currentStatus);

  return (
    <div className="flex items-center gap-1">
      {ONBOARDING_STEPS.map((step, i) => {
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
            {i < ONBOARDING_STEPS.length - 1 && (
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
        Datos simulados exclusivamente para demostración conceptual.
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{PARTNERS.length}</p>
          <p className="text-xs text-gray-500">Total Aliados</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-3xl font-bold text-green-700">{PARTNERS.filter((p) => p.status === "OPERATIONAL").length}</p>
          <p className="text-xs text-green-600">Operativos</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
          <p className="text-3xl font-bold text-blue-700">{PARTNERS.filter((p) => ["LEGAL_REVIEW", "VP_REVIEW"].includes(p.status)).length}</p>
          <p className="text-xs text-blue-600">En Revisión</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-3xl font-bold text-gray-700">{PARTNERS.filter((p) => ["DRAFT", "SUBMITTED"].includes(p.status)).length}</p>
          <p className="text-xs text-gray-500">Pendientes</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[{ key: "ALL", label: "Todos" }, ...ONBOARDING_STEPS].map((step) => (
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

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 italic text-center">
        Datos simulados exclusivamente para demostrar el modelo de aprobación secuencial y trazabilidad.
      </p>
    </div>
  );
}
