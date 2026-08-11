"use client";

import React from "react";
import { Network, Cloud, Server, Database, Shield, Eye, Cpu, Layers } from "lucide-react";

export default function ArquitecturaPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
        Arquitectura documentada del prototipo. La sección Enterprise corresponde a un diseño conceptual propuesto.
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
          <Network size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Arquitectura de Solución</h1>
          <p className="text-sm text-gray-500">POC implementado vs. Arquitectura empresarial objetivo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* POC Architecture — REAL */}
        <div className="rounded-xl border-2 border-blue-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Cloud size={18} className="text-blue-600" />
            <h2 className="text-lg font-bold text-blue-800">POC Implementado</h2>
            <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">ACTUAL</span>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2">
              <div className="w-full rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
                <p className="font-semibold text-slate-800 text-sm">Fuentes de Datos</p>
                <p className="text-xs text-slate-600">Excel PQR (51.008 registros) + Excel Maestro Aliados</p>
              </div>
              <div className="text-blue-400">↓</div>
              <div className="w-full rounded-lg bg-purple-50 border border-purple-200 p-3 text-center">
                <p className="font-semibold text-purple-800 text-sm">Python Data Engine</p>
                <p className="text-xs text-purple-600">ETL · Profiling · Calidad · Estadística · Riesgo · RCA</p>
                <p className="text-[10px] text-purple-500 mt-0.5">(Ejecución offline/CI — Polars, scikit-learn, Hypothesis)</p>
              </div>
              <div className="text-blue-400">↓</div>
              <div className="w-full rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-center">
                <p className="font-semibold text-indigo-800 text-sm">Neon PostgreSQL</p>
                <p className="text-xs text-indigo-600">Serverless — 51.008 registros cargados</p>
              </div>
              <div className="text-blue-400">↓</div>
              <div className="w-full rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="font-semibold text-blue-800 text-sm">Next.js 14 Route Handlers</p>
                <p className="text-xs text-blue-600">APIs REST + RBAC Middleware (JWT) + Auditoría</p>
              </div>
              <div className="text-blue-400">↓</div>
              <div className="w-full rounded-lg bg-cyan-50 border border-cyan-200 p-3 text-center">
                <p className="font-semibold text-cyan-800 text-sm">React + Next.js Frontend</p>
                <p className="text-xs text-cyan-600">Dashboard · Calidad · RCA · Riesgo · Operaciones</p>
              </div>
              <div className="text-blue-400">↓</div>
              <div className="w-full rounded-lg bg-gray-50 border border-gray-300 p-3 text-center">
                <p className="font-semibold text-gray-800 text-sm">Vercel</p>
                <p className="text-xs text-gray-600">Edge Network + Serverless Functions + Auto-deploy</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-600 mb-1">Stack implementado:</p>
              <div className="flex flex-wrap gap-1">
                {["Next.js 14", "React 18", "TypeScript", "Tailwind CSS", "Recharts", "Python 3.11", "Polars", "scikit-learn", "Neon PostgreSQL", "Vercel", "JWT/RBAC", "GitHub Actions"].map((tech) => (
                  <span key={tech} className="text-[10px] bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-2 rounded-lg bg-blue-50 border border-blue-100 p-3">
              <p className="text-xs font-medium text-blue-700 mb-1">Nota sobre FastAPI:</p>
              <p className="text-[10px] text-blue-600">
                El backend Python incluye una capa FastAPI disponible para procesamiento analítico y como motor de pipeline.
                En producción actual, las APIs de consumo del frontend son Route Handlers de Next.js que consultan
                directamente Neon PostgreSQL.
              </p>
            </div>
          </div>
        </div>

        {/* Enterprise Architecture — TARGET */}
        <div className="rounded-xl border-2 border-emerald-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server size={18} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-emerald-800">Arquitectura Enterprise</h2>
            <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">TARGET</span>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2">
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">Fuentes</p>
                <p className="text-xs text-emerald-600">SAP · Correos · Sistemas externos · APIs terceros</p>
              </div>
              <div className="text-emerald-400">↓</div>
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">Ingesta</p>
                <p className="text-xs text-emerald-600">S3 Landing Zone + EventBridge</p>
              </div>
              <div className="text-emerald-400">↓</div>
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">Procesamiento</p>
                <p className="text-xs text-emerald-600">Lambda (validación) + AWS Glue (ETL)</p>
              </div>
              <div className="text-emerald-400">↓</div>
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">Almacenamiento</p>
                <p className="text-xs text-emerald-600">Aurora PostgreSQL (Multi-AZ) + S3 Data Lake</p>
              </div>
              <div className="text-emerald-400">↓</div>
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">API & Seguridad</p>
                <p className="text-xs text-emerald-600">API Gateway + Cognito + WAF + VPC</p>
              </div>
              <div className="text-emerald-400">↓</div>
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">Observabilidad</p>
                <p className="text-xs text-emerald-600">CloudWatch + X-Ray + SNS + Dashboards</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-600 mb-1">Servicios AWS propuestos:</p>
              <div className="flex flex-wrap gap-1">
                {["S3", "EventBridge", "Lambda", "Glue", "Aurora", "Cognito", "API Gateway", "WAF", "CloudWatch", "X-Ray", "SNS", "CodePipeline"].map((tech) => (
                  <span key={tech} className="text-[10px] bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Comparación POC Actual vs Enterprise Target</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Aspecto</th>
                <th className="px-4 py-2 text-left font-medium text-blue-600">POC Implementado</th>
                <th className="px-4 py-2 text-left font-medium text-emerald-600">Enterprise Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ["Base de datos", "Neon PostgreSQL (Serverless)", "Aurora PostgreSQL (Multi-AZ)"],
                ["Autenticación", "JWT + RBAC 11 roles + Middleware", "Cognito + MFA + RBAC + SSO corporativo"],
                ["APIs", "Next.js Route Handlers", "API Gateway + microservicios"],
                ["Data Engine", "Python offline (Polars, scikit-learn)", "Lambda + Glue + SageMaker"],
                ["Observabilidad", "Health endpoint + CI logs", "CloudWatch + X-Ray + Alertas SNS"],
                ["Seguridad", "JWT firmado + RBAC + Audit log", "WAF + VPC + Encryption + Secrets Manager"],
                ["CI/CD", "GitHub Actions + Vercel auto-deploy", "CodePipeline + Blue/Green deploy"],
                ["Costo", "Free tier (prototipo)", "Sujeto a sizing, volumen y frecuencia — requiere AWS Pricing Calculator"],
                ["Disponibilidad", "Best-effort (Vercel Edge)", "Multi-AZ diseñada para el SLO/SLA que defina la organización"],
              ].map(([aspect, poc, enterprise]) => (
                <tr key={aspect} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{aspect}</td>
                  <td className="px-4 py-2 text-gray-600">{poc}</td>
                  <td className="px-4 py-2 text-gray-600">{enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security & Observability — Enterprise Target */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-green-600" />
            <h3 className="font-semibold text-gray-800">Seguridad — Enterprise Target</h3>
            <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">CONCEPTUAL DESIGN</span>
          </div>
          <ul className="space-y-1 text-xs text-gray-600">
            <li>• Encriptación en tránsito (TLS 1.3) y en reposo (AES-256)</li>
            <li>• Aislamiento de red (VPC privada + Security Groups)</li>
            <li>• Gestión de secretos (AWS Secrets Manager)</li>
            <li>• Logging de auditoría (CloudTrail + append-only)</li>
            <li>• Política de rotación de credenciales automatizada</li>
          </ul>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Eye size={16} className="text-blue-600" />
            <h3 className="font-semibold text-gray-800">Observabilidad — Enterprise Target</h3>
            <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">CONCEPTUAL DESIGN</span>
          </div>
          <ul className="space-y-1 text-xs text-gray-600">
            <li>• Métricas en tiempo real (CloudWatch Dashboards)</li>
            <li>• Trazabilidad distribuida (X-Ray)</li>
            <li>• Alertas proactivas (SNS + escalamiento)</li>
            <li>• Log aggregation centralizado</li>
            <li>• Dashboards ejecutivos con KPIs automáticos</li>
          </ul>
        </div>
      </div>

      {/* POC Security — Actually Implemented */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={16} className="text-blue-600" />
          <h3 className="font-semibold text-blue-800">Seguridad Implementada en el POC</h3>
          <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">IMPLEMENTADO</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-blue-700">
          <div>
            <p className="font-medium mb-1">Autenticación & Autorización</p>
            <ul className="space-y-0.5 text-blue-600">
              <li>• JWT firmado con verificación local (jose)</li>
              <li>• RBAC con 11 roles de la Lista Maestra</li>
              <li>• Middleware Next.js — validación en Edge</li>
              <li>• Validación de email corporativo</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">Trazabilidad & Protección</p>
            <ul className="space-y-0.5 text-blue-600">
              <li>• Auditoría append-only (audit_events)</li>
              <li>• HTTPS (Vercel Edge)</li>
              <li>• Variables de entorno para secrets</li>
              <li>• SQL parametrizado (sin concatenación)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 italic text-center">
        El POC demuestra viabilidad técnica. La arquitectura Enterprise requiere evaluación de costos mediante AWS Pricing Calculator
        según volumen, frecuencia y políticas de retención específicas de la organización.
      </p>
    </div>
  );
}
