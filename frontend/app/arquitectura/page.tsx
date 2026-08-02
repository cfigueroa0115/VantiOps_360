"use client";

import React from "react";
import { Network, Cloud, Server, Database, Shield, Eye } from "lucide-react";

export default function ArquitecturaPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
        Datos simulados exclusivamente para demostración conceptual.
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
          <Network size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Arquitectura de Solución</h1>
          <p className="text-sm text-gray-500">POC actual vs. Arquitectura empresarial objetivo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* POC Architecture */}
        <div className="rounded-xl border-2 border-blue-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Cloud size={18} className="text-blue-600" />
            <h2 className="text-lg font-bold text-blue-800">Arquitectura POC</h2>
            <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Actual</span>
          </div>

          <div className="space-y-3">
            {/* Flow diagram as styled divs */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-full rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="font-semibold text-blue-800 text-sm">Frontend</p>
                <p className="text-xs text-blue-600">Next.js 14 + React + Tailwind + Recharts</p>
              </div>
              <div className="text-blue-400">↓</div>
              <div className="w-full rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="font-semibold text-blue-800 text-sm">Hosting</p>
                <p className="text-xs text-blue-600">Vercel (Edge Network + Serverless Functions)</p>
              </div>
              <div className="text-blue-400">↓</div>
              <div className="w-full rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="font-semibold text-blue-800 text-sm">Backend API</p>
                <p className="text-xs text-blue-600">FastAPI (Python) — Railway/Render</p>
              </div>
              <div className="text-blue-400">↓</div>
              <div className="w-full rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="font-semibold text-blue-800 text-sm">Base de Datos</p>
                <p className="text-xs text-blue-600">Neon PostgreSQL (Serverless)</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-600 mb-1">Stack tecnológico:</p>
              <div className="flex flex-wrap gap-1">
                {["Next.js", "FastAPI", "PostgreSQL", "Neon", "Vercel", "Python", "TypeScript", "Tailwind"].map((tech) => (
                  <span key={tech} className="text-[10px] bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Enterprise Architecture */}
        <div className="rounded-xl border-2 border-emerald-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server size={18} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-emerald-800">Arquitectura Empresarial Objetivo</h2>
            <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Target</span>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2">
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">Ingesta</p>
                <p className="text-xs text-emerald-600">S3 Landing Zone + EventBridge</p>
              </div>
              <div className="text-emerald-400">↓</div>
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">Procesamiento</p>
                <p className="text-xs text-emerald-600">Lambda (Validación) + AWS Glue (ETL)</p>
              </div>
              <div className="text-emerald-400">↓</div>
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">Almacenamiento</p>
                <p className="text-xs text-emerald-600">Aurora PostgreSQL (Multi-AZ)</p>
              </div>
              <div className="text-emerald-400">↓</div>
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">API & Seguridad</p>
                <p className="text-xs text-emerald-600">API Gateway + Cognito + WAF</p>
              </div>
              <div className="text-emerald-400">↓</div>
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="font-semibold text-emerald-800 text-sm">Observabilidad</p>
                <p className="text-xs text-emerald-600">CloudWatch + X-Ray + SNS Alertas</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-600 mb-1">Servicios AWS:</p>
              <div className="flex flex-wrap gap-1">
                {["S3", "EventBridge", "Lambda", "Glue", "Aurora", "Cognito", "CloudWatch", "X-Ray", "API Gateway", "WAF", "SNS"].map((tech) => (
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
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Comparación POC vs Enterprise</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Aspecto</th>
                <th className="px-4 py-2 text-left font-medium text-blue-600">POC (Actual)</th>
                <th className="px-4 py-2 text-left font-medium text-emerald-600">Enterprise (Objetivo)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ["Base de datos", "Neon PostgreSQL (Serverless)", "Aurora PostgreSQL (Multi-AZ)"],
                ["Autenticación", "Sin auth (demo)", "Cognito + MFA + RBAC"],
                ["Escalabilidad", "Limitada (prototipo)", "Auto-scaling horizontal"],
                ["Observabilidad", "Logs básicos", "CloudWatch + X-Ray + Alertas"],
                ["Seguridad", "HTTPS básico", "WAF + VPC + Encryption at rest"],
                ["CI/CD", "Vercel auto-deploy", "CodePipeline + Blue/Green"],
                ["Costo mensual", "~$0 (free tier)", "~$2,000-5,000 USD estimado"],
                ["SLA", "N/A (demo)", "99.95% disponibilidad"],
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

      {/* Security & Compliance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-green-600" />
            <h3 className="font-semibold text-gray-800">Seguridad Enterprise</h3>
          </div>
          <ul className="space-y-1 text-xs text-gray-600">
            <li>✓ Encriptación en tránsito (TLS 1.3) y en reposo (AES-256)</li>
            <li>✓ Aislamiento de red (VPC privada)</li>
            <li>✓ Gestión de secretos (AWS Secrets Manager)</li>
            <li>✓ Logging de auditoría (CloudTrail)</li>
            <li>✓ Política de rotación de credenciales</li>
          </ul>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Eye size={16} className="text-blue-600" />
            <h3 className="font-semibold text-gray-800">Observabilidad</h3>
          </div>
          <ul className="space-y-1 text-xs text-gray-600">
            <li>✓ Métricas en tiempo real (CloudWatch Dashboards)</li>
            <li>✓ Trazabilidad distribuida (X-Ray)</li>
            <li>✓ Alertas proactivas (SNS + PagerDuty)</li>
            <li>✓ Log aggregation centralizado</li>
            <li>✓ Dashboards ejecutivos automáticos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
