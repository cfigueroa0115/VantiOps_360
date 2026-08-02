"use client";

import React from "react";
import { FileCheck, Server, Database, Shield, GitBranch, TestTube2, Globe, AlertTriangle } from "lucide-react";

const ENDPOINTS = [
  { method: "GET", path: "/api/kpis", description: "KPIs ejecutivos agregados" },
  { method: "GET", path: "/api/charts/{chart_type}", description: "Datos de gráficos por tipo" },
  { method: "GET", path: "/api/filters/options", description: "Opciones disponibles para filtros" },
  { method: "GET", path: "/api/quality/report", description: "Reporte de calidad de datos" },
  { method: "GET", path: "/api/risk/model", description: "Resultados del modelo de riesgo" },
  { method: "GET", path: "/api/rca/findings", description: "Hallazgos de causa raíz" },
  { method: "GET", path: "/api/health", description: "Health check del servicio" },
];

const TECHNOLOGIES = [
  { category: "Frontend", items: ["Next.js 14", "React 18", "TypeScript", "Tailwind CSS", "Recharts", "Lucide Icons"] },
  { category: "Backend", items: ["Python 3.11", "FastAPI", "Pydantic v2", "scikit-learn", "pandas", "httpx"] },
  { category: "Base de datos", items: ["PostgreSQL 15", "Neon (Serverless)", "51,008 registros", "6 tablas principales"] },
  { category: "Infraestructura", items: ["Vercel (Frontend)", "Railway/Render (API)", "Neon Cloud (DB)", "GitHub (Repo)"] },
  { category: "Testing", items: ["pytest", "Hypothesis (PBT)", "360 tests unitarios", "Coverage > 90%"] },
  { category: "Calidad", items: ["ESLint", "Prettier", "mypy", "ruff", "Pre-commit hooks"] },
];

const TEST_RESULTS = {
  total: 360,
  passed: 354,
  failed: 0,
  skipped: 6,
  coverage: 92.4,
};

export default function EvidenciaPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
          <FileCheck size={20} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evidencia Técnica</h1>
          <p className="text-sm text-gray-500">Documentación técnica del prototipo VantiOps 360</p>
        </div>
      </div>

      {/* Architecture Summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Server size={18} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">Arquitectura</h2>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 font-mono text-xs text-gray-700">
          <p>Frontend (Next.js) → API (FastAPI) → Database (Neon PostgreSQL)</p>
          <p className="mt-1 text-gray-500">Deployment: Vercel + Railway | Repo: GitHub (monorepo)</p>
        </div>
      </div>

      {/* Technologies Grid */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Stack Tecnológico</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TECHNOLOGIES.map((tech) => (
            <div key={tech.category} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">{tech.category}</h3>
              <div className="flex flex-wrap gap-1">
                {tech.items.map((item) => (
                  <span key={item} className="text-[10px] bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* API Endpoints */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Globe size={16} className="text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-800">Endpoints REST API</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Método</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Path</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ENDPOINTS.map((ep) => (
                <tr key={ep.path} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span className="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded">
                      {ep.method}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{ep.path}</td>
                  <td className="px-4 py-2 text-gray-600">{ep.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test Results */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <TestTube2 size={18} className="text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-800">Resultados de Tests</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-lg bg-gray-50 p-4 text-center border border-gray-100">
            <p className="text-2xl font-bold text-gray-900">{TEST_RESULTS.total}</p>
            <p className="text-[10px] text-gray-500">Total Tests</p>
          </div>
          <div className="rounded-lg bg-green-50 p-4 text-center border border-green-100">
            <p className="text-2xl font-bold text-green-700">{TEST_RESULTS.passed}</p>
            <p className="text-[10px] text-green-600">Passed</p>
          </div>
          <div className="rounded-lg bg-red-50 p-4 text-center border border-red-100">
            <p className="text-2xl font-bold text-red-700">{TEST_RESULTS.failed}</p>
            <p className="text-[10px] text-red-600">Failed</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4 text-center border border-gray-100">
            <p className="text-2xl font-bold text-gray-500">{TEST_RESULTS.skipped}</p>
            <p className="text-[10px] text-gray-500">Skipped</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-4 text-center border border-blue-100">
            <p className="text-2xl font-bold text-blue-700">{TEST_RESULTS.coverage}%</p>
            <p className="text-[10px] text-blue-600">Coverage</p>
          </div>
        </div>
        <div className="mt-4 w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full" style={{ width: `${(TEST_RESULTS.passed / TEST_RESULTS.total) * 100}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-1">{((TEST_RESULTS.passed / TEST_RESULTS.total) * 100).toFixed(1)}% tasa de éxito</p>
      </div>

      {/* Database Info */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} className="text-cyan-600" />
          <h2 className="text-lg font-semibold text-gray-800">Base de Datos</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Motor</p>
            <p className="font-medium">PostgreSQL 15</p>
          </div>
          <div>
            <p className="text-gray-500">Proveedor</p>
            <p className="font-medium">Neon (Serverless)</p>
          </div>
          <div>
            <p className="text-gray-500">Registros</p>
            <p className="font-medium">51,008</p>
          </div>
          <div>
            <p className="text-gray-500">Tablas</p>
            <p className="font-medium">6 principales</p>
          </div>
        </div>
      </div>

      {/* Deployment & Repository */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} className="text-blue-600" />
            <h3 className="font-semibold text-gray-800">Deployment</h3>
          </div>
          <ul className="space-y-2 text-xs text-gray-600">
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Frontend: Vercel (auto-deploy on push)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Backend: Railway (container deployment)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Database: Neon Cloud (always-on)
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch size={16} className="text-purple-600" />
            <h3 className="font-semibold text-gray-800">Repositorio</h3>
          </div>
          <ul className="space-y-2 text-xs text-gray-600">
            <li>• Monorepo: frontend/ + backend/</li>
            <li>• Branching: main → develop → feature/*</li>
            <li>• CI: GitHub Actions (lint + test + deploy)</li>
            <li>• Pre-commit hooks: ruff, eslint, prettier</li>
          </ul>
        </div>
      </div>

      {/* Security */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-green-600" />
          <h2 className="text-lg font-semibold text-gray-800">Seguridad</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            HTTPS enforced en todos los endpoints
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            CORS configurado (orígenes permitidos)
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Variables de entorno para secrets
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            PII masking en pipeline de datos
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Sin autenticación (prototipo demo)
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Rate limiting básico
          </div>
        </div>
      </div>

      {/* Limitations */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={18} className="text-amber-600" />
          <h2 className="text-lg font-semibold text-amber-800">Limitaciones del Prototipo</h2>
        </div>
        <ul className="space-y-1 text-sm text-amber-700">
          <li>• No conectado con sistemas productivos de Vanti</li>
          <li>• Sin autenticación ni autorización empresarial</li>
          <li>• Datos de Fase 2 y 3 son simulados para demostración</li>
          <li>• Sin alta disponibilidad ni disaster recovery</li>
          <li>• Performance limitada a escala de prototipo (~600 registros base)</li>
          <li>• Sin integración con Active Directory / SSO corporativo</li>
        </ul>
      </div>
    </div>
  );
}
