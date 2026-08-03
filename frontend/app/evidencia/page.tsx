"use client";

import React, { useEffect, useState } from "react";
import {
  FileCheck, Server, Database, Shield, GitBranch,
  TestTube2, Globe, AlertTriangle, Zap, Layers,
  CheckCircle2, XCircle, Clock
} from "lucide-react";

// ─── Data ────────────────────────────────────────────────────────────────

const ENDPOINTS = [
  { method: "GET", path: "/api/health", description: "Health check con validación DB", status: "live" },
  { method: "GET", path: "/api/charts/pareto", description: "Análisis Pareto — fuente única", status: "live" },
  { method: "GET", path: "/api/kpis", description: "KPIs ejecutivos agregados", status: "live" },
  { method: "GET", path: "/api/rca", description: "Causa raíz principal", status: "live" },
  { method: "GET", path: "/api/risk/model", description: "Modelo de riesgo operacional", status: "live" },
  { method: "GET", path: "/api/quality", description: "Score de calidad de datos", status: "live" },
  { method: "POST", path: "/api/auth/validate", description: "Validación de email corporativo", status: "live" },
  { method: "GET", path: "/api/audit", description: "Logs de auditoría (protegido)", status: "protected" },
  { method: "GET", path: "/api/capacity", description: "Modelo de capacidad operacional", status: "protected" },
  { method: "POST", path: "/api/annulations", description: "Gestión de anulaciones", status: "protected" },
];

const TECHNOLOGIES = [
  { category: "Frontend", icon: <Layers size={16} />, color: "from-blue-500 to-cyan-500", items: ["Next.js 14", "React 18", "TypeScript 5.7", "Tailwind CSS", "Recharts", "Radix UI"] },
  { category: "Backend", icon: <Server size={16} />, color: "from-emerald-500 to-teal-500", items: ["Python 3.11", "FastAPI", "Polars", "DuckDB", "scikit-learn", "Hypothesis"] },
  { category: "Base de Datos", icon: <Database size={16} />, color: "from-purple-500 to-indigo-500", items: ["Neon PostgreSQL", "Serverless", "51.008 registros base assessment"] },
  { category: "Infraestructura", icon: <Globe size={16} />, color: "from-orange-500 to-red-500", items: ["Vercel", "GitHub Actions"] },
  { category: "Testing", icon: <TestTube2 size={16} />, color: "from-pink-500 to-rose-500", items: ["Vitest", "Playwright", "pytest", "Hypothesis PBT"] },
  { category: "Seguridad", icon: <Shield size={16} />, color: "from-amber-500 to-yellow-500", items: ["RBAC 11 roles", "JWT middleware", "Audit append-only", "Email validation"] },
];

// ─── Types ───────────────────────────────────────────────────────────────

type HealthStatus = "success" | "failure" | "pending";
type ValidationStatus = "success" | "unavailable" | "failure" | "pending";

interface HealthData {
  status: string;
  database?: { connected: boolean; latencyMs?: number };
}

interface ValidationData {
  commitHash?: string | null;
  generatedAt?: string | null;
  source?: string;
  workflowStatus?: string;
  backendTests?: { total?: number; passed?: number; status?: string } | null;
  frontendTests?: { total?: number; passed?: number; status?: string } | null;
  coverage?: number | null;
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function EvidenciaPage() {
  const [mounted, setMounted] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("pending");
  const [validation, setValidation] = useState<ValidationData | null>(null);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>("pending");

  useEffect(() => {
    setMounted(true);

    // Fetch live health with proper error handling
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) {
          setHealthStatus("failure");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setHealth(data);
          setHealthStatus("success");
        }
      })
      .catch(() => {
        setHealthStatus("failure");
      });

    // Fetch latest validation JSON with proper error handling
    fetch("/evidence/latest-validation.json")
      .then((r) => {
        if (!r.ok) {
          setValidationStatus("failure");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setValidation(data);
          // Determine status based on content
          if (data.workflowStatus === "unavailable" && !data.commitHash) {
            setValidationStatus("unavailable");
          } else {
            setValidationStatus("success");
          }
        }
      })
      .catch(() => {
        setValidationStatus("failure");
      });
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ─── Hero Header ─── */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(59,130,246,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(16,185,129,0.1),transparent_50%)]" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 shadow-lg shadow-emerald-500/25">
            <FileCheck size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Evidencia Técnica</h1>
            <p className="text-sm text-slate-300 mt-1">Stack, arquitectura y calidad de VantiOps 360</p>
          </div>
        </div>
        {/* Dynamic health indicator */}
        <div className="mt-6 flex flex-wrap gap-3">
          <HealthBadge status={healthStatus} label="Health" />
          <ValidationBadge status={validationStatus} label="CI Validation" />
        </div>
      </div>

      {/* ─── Tech Stack Grid ─── */}
      <div className={`transition-all duration-700 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Zap size={18} className="text-amber-500" />
          Stack Tecnológico
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TECHNOLOGIES.map((tech, i) => (
            <div
              key={tech.category}
              className={`group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5
                transition-all duration-300 ease-out
                hover:shadow-xl hover:shadow-gray-200/50 hover:border-transparent hover:-translate-y-1 hover:scale-[1.02]`}
              style={{ transitionDelay: `${i * 75}ms` }}
            >
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-[0.04] transition-opacity duration-500 bg-gradient-to-br ${tech.color}`} />
              <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${tech.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${tech.color} text-white shadow-sm
                    transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                    {tech.icon}
                  </div>
                  <h3 className="font-semibold text-gray-800 text-sm">{tech.category}</h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tech.items.map((item) => (
                    <span
                      key={item}
                      className="text-[10px] bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full text-gray-600
                        transition-all duration-200 hover:bg-gray-100 hover:border-gray-200 hover:text-gray-800 hover:scale-105"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── API Endpoints ─── */}
      <div className={`overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2 bg-gradient-to-r from-gray-50 to-white">
          <Globe size={16} className="text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-800">Endpoints REST API</h2>
          <span className="ml-auto text-[10px] bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full border border-gray-100">
            {ENDPOINTS.length} definidos
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Método</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Endpoint</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Descripción</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ENDPOINTS.map((ep) => (
                <tr key={ep.path} className="group transition-colors duration-200 hover:bg-blue-50/30">
                  <td className="px-4 py-2.5">
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded
                      ${ep.method === "GET" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                      {ep.method}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{ep.path}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{ep.description}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full
                      ${ep.status === "live" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100"}`}>
                      {ep.status === "live" ? "Público" : "Protegido"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Architecture Flow ─── */}
      <div className={`rounded-xl border border-gray-100 bg-white p-6 transition-all duration-700 delay-400 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="flex items-center gap-2 mb-5">
          <Server size={18} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">Arquitectura</h2>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-0">
          {[
            { label: "Browser", sub: "React 18 SPA", color: "from-blue-500 to-cyan-500" },
            { label: "Vercel Edge", sub: "Next.js 14 + RBAC MW", color: "from-slate-700 to-slate-900" },
            { label: "Route Handlers", sub: "API endpoints", color: "from-emerald-500 to-teal-600" },
            { label: "Neon PostgreSQL", sub: "Serverless DB", color: "from-purple-500 to-indigo-600" },
          ].map((node, i) => (
            <React.Fragment key={node.label}>
              <div className="group relative flex-shrink-0">
                <div className={`relative rounded-xl bg-gradient-to-br ${node.color} p-4 text-center text-white min-w-[140px]
                  shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105 hover:-translate-y-1`}>
                  <p className="font-semibold text-sm">{node.label}</p>
                  <p className="text-[10px] text-white/70 mt-0.5">{node.sub}</p>
                </div>
              </div>
              {i < 3 && (
                <div className="hidden md:flex items-center px-2">
                  <div className="w-8 h-0.5 bg-gradient-to-r from-gray-300 to-gray-200 rounded-full" />
                  <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-gray-300" />
                </div>
              )}
              {i < 3 && (
                <div className="md:hidden flex items-center justify-center">
                  <div className="w-0.5 h-4 bg-gradient-to-b from-gray-300 to-gray-200 rounded-full" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ─── Live Validation Section ─── */}
      <div className={`rounded-xl border border-gray-100 bg-white p-6 transition-all duration-700 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`} data-testid="live-validation">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 size={18} className="text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-800">Validación en Vivo</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <StatusCard
            label="Health Check"
            status={healthStatus}
            value={healthStatus === "success" ? health?.status || "—" : healthStatus === "failure" ? "No disponible" : "Verificando..."}
          />
          <StatusCard
            label="Base de Datos"
            status={healthStatus === "success" && health?.database?.connected ? "success" : healthStatus === "pending" ? "pending" : "failure"}
            value={
              healthStatus === "success" && health?.database?.connected
                ? `Conectada (${health.database.latencyMs ?? "?"}ms)`
                : healthStatus === "pending"
                ? "Verificando..."
                : "No disponible"
            }
          />
          <StatusCard
            label="CI Commit"
            status={validation?.commitHash ? "success" : validationStatus === "pending" ? "pending" : "unavailable"}
            value={validation?.commitHash || (validationStatus === "pending" ? "Verificando..." : "No disponible")}
            mono
          />
          <StatusCard
            label="Frontend Tests"
            status={validation?.frontendTests?.total ? "success" : validationStatus === "pending" ? "pending" : "unavailable"}
            value={
              validation?.frontendTests?.total
                ? `${validation.frontendTests.total} (${validation.frontendTests.status})`
                : validationStatus === "pending"
                ? "Verificando..."
                : "No disponible"
            }
          />
          <StatusCard
            label="Backend Tests"
            status={validation?.backendTests?.total ? "success" : validationStatus === "pending" ? "pending" : "unavailable"}
            value={
              validation?.backendTests?.total
                ? `${validation.backendTests.total} (${validation.backendTests.status})`
                : validationStatus === "pending"
                ? "Verificando..."
                : "No disponible"
            }
          />
          <StatusCard
            label="Coverage"
            status={validation?.coverage != null ? "success" : validationStatus === "pending" ? "pending" : "unavailable"}
            value={validation?.coverage != null ? `${validation.coverage}%` : validationStatus === "pending" ? "Verificando..." : "No disponible"}
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-3 italic">
          Datos obtenidos en tiempo real de /api/health y /evidence/latest-validation.json. Los valores dependen del estado actual del despliegue.
        </p>
      </div>

      {/* ─── Limitations Banner ─── */}
      <div className={`relative overflow-hidden rounded-xl border border-amber-200/50 bg-gradient-to-r from-amber-50 to-orange-50 p-6
        transition-all duration-700 delay-[600ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-200/30 to-transparent rounded-bl-full" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <h2 className="text-base font-semibold text-amber-800">Alcance del Prototipo</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-amber-700">
            {[
              "SAP, Power Automate, R → diseño conceptual (no productivo)",
              "Autenticación JWT local (sin Azure AD/SSO)",
              "Datos de demostración con proveniencia documentada",
              "Rendimiento validado para uso de assessment únicamente",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────

function HealthBadge({ status, label }: { status: HealthStatus; label: string }) {
  const config = {
    success: { color: "bg-emerald-400", text: "text-white/90", border: "border-emerald-400/30", bg: "bg-white/10" },
    failure: { color: "bg-red-400", text: "text-white/90", border: "border-red-400/30", bg: "bg-red-500/10" },
    pending: { color: "bg-amber-400 animate-pulse", text: "text-white/70", border: "border-amber-400/30", bg: "bg-white/5" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} backdrop-blur-sm border ${c.border} px-3 py-1 text-xs ${c.text}`} data-testid={`badge-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.color}`} />
      {label}: {status === "success" ? "OK" : status === "failure" ? "Error" : "..."}
    </span>
  );
}

function ValidationBadge({ status, label }: { status: ValidationStatus; label: string }) {
  const config = {
    success: { color: "bg-emerald-400", text: "text-white/90", border: "border-emerald-400/30", bg: "bg-white/10" },
    unavailable: { color: "bg-amber-400", text: "text-white/70", border: "border-amber-400/30", bg: "bg-white/5" },
    failure: { color: "bg-red-400", text: "text-white/90", border: "border-red-400/30", bg: "bg-red-500/10" },
    pending: { color: "bg-amber-400 animate-pulse", text: "text-white/70", border: "border-amber-400/30", bg: "bg-white/5" },
  };
  const c = config[status];
  const statusText = status === "success" ? "OK" : status === "unavailable" ? "Pendiente" : status === "failure" ? "Error" : "...";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} backdrop-blur-sm border ${c.border} px-3 py-1 text-xs ${c.text}`} data-testid={`badge-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.color}`} />
      {label}: {statusText}
    </span>
  );
}

function StatusCard({ label, status, value, mono }: { label: string; status: string; value: string; mono?: boolean }) {
  const borderColor = status === "success" ? "border-emerald-200" : status === "failure" ? "border-red-200" : status === "unavailable" ? "border-amber-200" : "border-gray-100";
  const textColor = status === "success" ? "text-emerald-600" : status === "failure" ? "text-red-600" : status === "unavailable" ? "text-amber-600" : "text-gray-500";
  return (
    <div className={`rounded-lg border ${borderColor} p-3`} data-testid={`status-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-semibold ${textColor} ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </p>
    </div>
  );
}
