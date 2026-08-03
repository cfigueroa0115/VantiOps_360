"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useChartData } from "@/hooks/useChartData";
import { SearchCode, Target, ListOrdered, Table2, GitBranch, X, ZoomIn } from "lucide-react";

const PARETO_DATA = [
  { cause: "Cancela Servihogar a solicitud cliente", pct: 49.2, cumulative: 49.2 },
  { cause: "Reclamo comercial gas", pct: 15.1, cumulative: 64.3 },
  { cause: "Solicitud de revisión", pct: 9.8, cumulative: 74.1 },
  { cause: "Factura elevada", pct: 7.4, cumulative: 81.5 },
  { cause: "Cambio de nombre", pct: 5.2, cumulative: 86.7 },
  { cause: "Otros", pct: 13.3, cumulative: 100.0 },
];

const FIVE_WHYS = [
  "¿Por qué se cancelan masivamente los servicios Servihogar? → Porque los clientes no perciben valor en el servicio.",
  "¿Por qué no perciben valor? → Porque el servicio no se utiliza o no se comunica adecuadamente.",
  "¿Por qué no se utiliza? → Porque no hay recordatorio ni activación proactiva del beneficio.",
  "¿Por qué no hay activación proactiva? → Porque el proceso de retención carece de trigger automático.",
  "¿Por qué no existe un trigger automático? → Porque el sistema de gestión no tiene integración con el ciclo de vida del cliente.",
];

const ISHIKAWA = [
  { category: "Personas", factors: ["Falta de capacitación en retención", "Alta rotación de agentes", "Sin incentivos por retención"] },
  { category: "Procesos", factors: ["Ausencia de protocolo de retención", "Cancelación sin validación de causa raíz", "Sin escalamiento a especialista"] },
  { category: "Tecnología", factors: ["Sin alertas de churn prediction", "CRM sin scoring de cliente", "Canales digitales limitados"] },
  { category: "Datos", factors: ["Motivo de cierre incompleto", "Sin histórico de interacciones", "Marcación no obligatoria"] },
  { category: "Medición", factors: ["KPI de retención no medido", "Sin seguimiento post-cancelación", "ANS no incluye retención"] },
  { category: "Políticas", factors: ["Cancelación inmediata sin periodo de gracia", "Sin oferta de valor alternativa", "Política de reembolso rígida"] },
];

const SIPOC = [
  { supplier: "Cliente", input: "Solicitud de cancelación", process: "Gestión PQR", output: "Cancelación ejecutada", customer: "Cliente / Vanti" },
  { supplier: "Agente de servicio", input: "Registro en sistema", process: "Validación de datos", output: "PQR clasificada", customer: "Área de operaciones" },
  { supplier: "Sistema CRM", input: "Datos del cliente", process: "Análisis de causa", output: "Informe de causa raíz", customer: "Gestión de calidad" },
  { supplier: "Área de retención", input: "Propuesta de valor", process: "Oferta de retención", output: "Aceptación/Rechazo", customer: "Cliente" },
];

const FMEA_DATA = [
  { mode: "Cancelación sin intento de retención", effect: "Pérdida de cliente", severity: 9, occurrence: 8, detection: 3, rpn: 216, action: "Implementar flujo obligatorio de retención" },
  { mode: "Datos incompletos en cierre", effect: "Imposibilidad de análisis causal", severity: 7, occurrence: 7, detection: 4, rpn: 196, action: "Campos obligatorios en formulario" },
  { mode: "Sin alerta de riesgo de churn", effect: "Acción reactiva vs proactiva", severity: 8, occurrence: 6, detection: 2, rpn: 96, action: "Modelo predictivo de abandono" },
  { mode: "Canal único (telefónico)", effect: "Fricción en experiencia del cliente", severity: 6, occurrence: 9, detection: 5, rpn: 270, action: "Habilitar canales digitales autoservicio" },
];

export default function RCAPage() {
  const { data, loading, error } = useChartData("pareto");
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);

  // Derive main cause from live Pareto endpoint (same source as Dashboard)
  const paretoArray = data?.data || [];
  const liveTopCause = paretoArray.length > 0 ? (paretoArray[0] as any).causa : null;
  const liveTopPct = paretoArray.length > 0 ? Number((paretoArray[0] as any).percentage) : null;
  const liveTotalRecords = paretoArray.length > 0 ? paretoArray.reduce((sum: number, d: any) => sum + (d.count || 0), 0) : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
          <SearchCode size={20} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Análisis de Causa Raíz</h1>
          <p className="text-sm text-gray-500">Metodologías: Pareto, SIPOC, 5 Por qués, Ishikawa, FMEA, BPMN</p>
        </div>
      </div>

      {/* Main Cause — from live endpoint */}
      <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Target size={18} className="text-purple-600" />
          <h2 className="text-lg font-semibold text-purple-900">Causa Principal Identificada</h2>
        </div>
        {loading ? (
          <p className="text-sm text-purple-600 animate-pulse">Cargando datos del endpoint Pareto...</p>
        ) : error ? (
          <p className="text-sm text-red-600">Error al obtener datos del endpoint Pareto.</p>
        ) : liveTopCause ? (
          <>
            <p className="text-2xl font-bold text-purple-800">&ldquo;{liveTopCause}&rdquo;</p>
            <p className="text-sm text-purple-600 mt-2">
              Concentra {liveTopPct?.toFixed(2)}% del volumen total de PQR
              {liveTotalRecords ? ` (${liveTotalRecords.toLocaleString()} registros analizados)` : ""}
            </p>
            <p className="text-[10px] text-purple-500 mt-1">Fuente: /api/charts/pareto — misma fuente que el Dashboard</p>
          </>
        ) : (
          <p className="text-sm text-purple-600">Sin datos disponibles del endpoint Pareto.</p>
        )}
      </div>

      {/* Disclaimer metodológico */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
        La concentración estadística identifica una prioridad de análisis. Los cinco porqués, Ishikawa y FMEA
        representan hipótesis que deben validarse con expertos del proceso antes de considerarse causa raíz confirmada.
      </div>

      {/* Pareto Chart — live data with fallback */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Análisis de Pareto</h2>
        {paretoArray.length > 0 ? (
          <div className="space-y-2">
            {paretoArray.slice(0, 8).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-64 text-sm text-gray-700 truncate">{item.causa}</span>
                <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                    style={{ width: `${Math.min(Number(item.percentage) * 2, 100)}%` }}
                  />
                  <span className="absolute right-2 top-1 text-xs font-medium text-gray-600">
                    {Number(item.percentage).toFixed(1)}% (acum: {Number(item.cumulative_pct).toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {PARETO_DATA.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-64 text-sm text-gray-700 truncate">{item.cause}</span>
                <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                    style={{ width: `${item.pct * 2}%` }}
                  />
                  <span className="absolute right-2 top-1 text-xs font-medium text-gray-600">
                    {item.pct}% (acum: {item.cumulative}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SIPOC */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Diagrama SIPOC</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-purple-700">Supplier</th>
                <th className="px-3 py-2 text-left font-semibold text-purple-700">Input</th>
                <th className="px-3 py-2 text-left font-semibold text-purple-700">Process</th>
                <th className="px-3 py-2 text-left font-semibold text-purple-700">Output</th>
                <th className="px-3 py-2 text-left font-semibold text-purple-700">Customer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SIPOC.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{row.supplier}</td>
                  <td className="px-3 py-2">{row.input}</td>
                  <td className="px-3 py-2 font-medium">{row.process}</td>
                  <td className="px-3 py-2">{row.output}</td>
                  <td className="px-3 py-2">{row.customer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5 Whys */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <ListOrdered size={18} className="text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-800">5 Por Qués</h2>
        </div>
        <ol className="space-y-3">
          {FIVE_WHYS.map((why, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-700">
                {i + 1}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed pt-1">{why}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Ishikawa */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Diagrama de Ishikawa (Causa-Efecto)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ISHIKAWA.map((cat) => (
            <div key={cat.category} className="rounded-lg border border-gray-100 p-4 bg-gray-50">
              <h3 className="font-semibold text-purple-700 text-sm mb-2">{cat.category}</h3>
              <ul className="space-y-1">
                {cat.factors.map((f, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                    <span className="text-purple-400 mt-0.5">•</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* FMEA Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Table2 size={18} className="text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-800">Análisis FMEA</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Modo de Falla</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Efecto</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">S</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">O</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">D</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">RPN</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Acción Recomendada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {FMEA_DATA.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{row.mode}</td>
                  <td className="px-3 py-2 text-gray-600">{row.effect}</td>
                  <td className="px-3 py-2 text-center">{row.severity}</td>
                  <td className="px-3 py-2 text-center">{row.occurrence}</td>
                  <td className="px-3 py-2 text-center">{row.detection}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                      row.rpn >= 200 ? "bg-red-100 text-red-700" : row.rpn >= 100 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                    }`}>
                      {row.rpn}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BPMN Process Flows */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch size={18} className="text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-800">Flujos BPMN</h2>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* AS-IS */}
          <article data-testid="bpmn-asis-card" className="rounded-xl border border-red-200 bg-red-50/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-red-700">AS-IS (Estado actual)</h3>
            <div
              className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-sm cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => setZoomedImage({ src: "/bpmn/AsIs.jpg", alt: "Diagrama BPMN del proceso actual de cancelación AS-IS" })}
            >
              <Image
                data-testid="bpmn-asis-image"
                src="/bpmn/AsIs.jpg"
                alt="Diagrama BPMN del proceso actual de cancelación AS-IS"
                width={2000}
                height={900}
                className="h-auto w-full object-contain"
                sizes="(max-width: 1280px) 100vw, 50vw"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/5 transition-colors">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2 shadow-lg">
                  <ZoomIn size={20} className="text-gray-700" />
                </div>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-amber-600" aria-hidden="true">⚠</span>
                <span>Sin intento de retención</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600" aria-hidden="true">⚠</span>
                <span>Sin análisis de causa</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600" aria-hidden="true">⚠</span>
                <span>Sin validación de datos completos</span>
              </li>
            </ul>
          </article>

          {/* TO-BE */}
          <article data-testid="bpmn-tobe-card" className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-emerald-700">TO-BE (Estado deseado)</h3>
            <div
              className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-sm cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => setZoomedImage({ src: "/bpmn/ToBe.jpg", alt: "Diagrama BPMN del proceso futuro de cancelación TO-BE" })}
            >
              <Image
                data-testid="bpmn-tobe-image"
                src="/bpmn/ToBe.jpg"
                alt="Diagrama BPMN del proceso futuro de cancelación TO-BE"
                width={2000}
                height={900}
                className="h-auto w-full object-contain"
                sizes="(max-width: 1280px) 100vw, 50vw"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/5 transition-colors">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2 shadow-lg">
                  <ZoomIn size={20} className="text-gray-700" />
                </div>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600" aria-hidden="true">✓</span>
                <span>Intento de retención obligatorio</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600" aria-hidden="true">✓</span>
                <span>Causa raíz documentada</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600" aria-hidden="true">✓</span>
                <span>Datos completos validados</span>
              </li>
            </ul>
          </article>
        </div>
      </div>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setZoomedImage(null)}
        >
          <button
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg hover:bg-white transition-colors"
            aria-label="Cerrar imagen ampliada"
          >
            <X size={20} className="text-gray-700" />
          </button>
          <div
            className="relative max-w-[95vw] max-h-[90vh] overflow-auto rounded-xl bg-white shadow-2xl p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={zoomedImage.src}
              alt={zoomedImage.alt}
              width={3000}
              height={1500}
              className="h-auto w-full max-h-[85vh] object-contain rounded-lg"
              sizes="95vw"
              priority
            />
          </div>
        </div>
      )}
    </div>
  );
}
