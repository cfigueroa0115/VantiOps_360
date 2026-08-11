"use client";

import React from "react";
import { Scale, Award, CheckCircle2 } from "lucide-react";

const CRITERIA = [
  { key: "capacity", label: "Capacidad Operativa", weight: 0.20 },
  { key: "quality", label: "Calidad de Servicio", weight: 0.20 },
  { key: "technology", label: "Tecnología", weight: 0.15 },
  { key: "security", label: "Seguridad", weight: 0.15 },
  { key: "transition", label: "Plan de Transición", weight: 0.10 },
  { key: "talent", label: "Talento Humano", weight: 0.10 },
  { key: "cost", label: "Costo", weight: 0.10 },
];

const VENDORS = [
  {
    name: "OptiServ Solutions",
    scores: { capacity: 8.5, quality: 9.0, technology: 8.0, security: 8.5, transition: 7.5, talent: 8.0, cost: 7.0 },
  },
  {
    name: "DataCore Services",
    scores: { capacity: 7.5, quality: 8.0, technology: 9.5, security: 9.0, transition: 8.0, talent: 7.5, cost: 6.5 },
  },
  {
    name: "ProGest Colombia",
    scores: { capacity: 9.0, quality: 7.5, technology: 7.0, security: 7.0, transition: 8.5, talent: 9.0, cost: 8.5 },
  },
];

function calculateWeightedScore(scores: Record<string, number>): number {
  return CRITERIA.reduce((total, criterion) => {
    return total + (scores[criterion.key] || 0) * criterion.weight;
  }, 0);
}

export default function ProveedoresPage() {
  const vendorsWithTotals = VENDORS.map((v) => ({
    ...v,
    total: calculateWeightedScore(v.scores),
  })).sort((a, b) => b.total - a.total);

  const winner = vendorsWithTotals[0];

  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
        Datos simulados exclusivamente para demostración conceptual.
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
          <Scale size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Selección de Proveedores</h1>
          <p className="text-sm text-gray-500">Matriz ponderada de evaluación — 7 criterios, 3 candidatos</p>
        </div>
      </div>

      {/* Recommendation */}
      <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6">
        <div className="flex items-center gap-3">
          <Award size={24} className="text-green-600" />
          <div>
            <p className="text-sm text-green-700 font-medium">Resultado del ejercicio simulado</p>
            <p className="text-xl font-bold text-green-800">{winner.name}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-3xl font-bold text-green-700">{winner.total.toFixed(2)}</p>
            <p className="text-xs text-green-600">Puntaje ponderado /10</p>
          </div>
        </div>
      </div>

      {/* Criteria Weights */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Criterios de Evaluación y Pesos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {CRITERIA.map((c) => (
            <div key={c.key} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="text-center">
                <p className="text-lg font-bold text-indigo-600">{(c.weight * 100).toFixed(0)}%</p>
              </div>
              <p className="text-sm text-gray-700">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Evaluation Matrix */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Matriz de Evaluación Ponderada</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Criterio</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Peso</th>
                {vendorsWithTotals.map((v) => (
                  <th key={v.name} className="px-4 py-3 text-center font-medium text-gray-600">
                    {v.name}
                    {v === winner && <span className="ml-1 text-green-600">★</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {CRITERIA.map((criterion) => (
                <tr key={criterion.key} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{criterion.label}</td>
                  <td className="px-4 py-3 text-center text-indigo-600 font-medium">{(criterion.weight * 100).toFixed(0)}%</td>
                  {vendorsWithTotals.map((v) => {
                    const score = (v.scores as Record<string, number>)[criterion.key] || 0;
                    const weighted = score * criterion.weight;
                    const isMax = Math.max(...vendorsWithTotals.map((vv) => (vv.scores as Record<string, number>)[criterion.key] || 0)) === score;
                    return (
                      <td key={v.name} className="px-4 py-3 text-center">
                        <span className={`font-medium ${isMax ? "text-green-700" : "text-gray-700"}`}>
                          {score.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">({weighted.toFixed(2)})</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Totals Row */}
              <tr className="bg-gray-50 font-bold">
                <td className="px-4 py-3">TOTAL PONDERADO</td>
                <td className="px-4 py-3 text-center">100%</td>
                {vendorsWithTotals.map((v) => (
                  <td key={v.name} className={`px-4 py-3 text-center text-lg ${v === winner ? "text-green-700" : "text-gray-800"}`}>
                    {v.total.toFixed(2)}
                    {v === winner && <CheckCircle2 size={14} className="inline ml-1 text-green-600" />}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual Comparison */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Comparación Visual</h2>
        <div className="space-y-4">
          {vendorsWithTotals.map((v, i) => (
            <div key={v.name} className="flex items-center gap-4">
              <span className="w-8 text-center">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
              </span>
              <span className="w-40 text-sm font-medium text-gray-700">{v.name}</span>
              <div className="flex-1 h-8 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full flex items-center justify-end pr-3 ${
                    i === 0 ? "bg-gradient-to-r from-green-400 to-green-500" :
                    i === 1 ? "bg-gradient-to-r from-blue-400 to-blue-500" :
                    "bg-gradient-to-r from-gray-400 to-gray-500"
                  }`}
                  style={{ width: `${(v.total / 10) * 100}%` }}
                >
                  <span className="text-xs font-bold text-white">{v.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Methodology Note */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-800 text-sm mb-2">Metodología</h3>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• Escala de calificación: 1-10 por criterio</li>
          <li>• Ponderaciones propuestas para el ejercicio, sujetas a validación con los stakeholders responsables de la contratación</li>
          <li>• Evaluación basada en RFI, demo técnica y referencias comerciales</li>
          <li>• Score final = Σ (calificación × peso) para cada proveedor</li>
        </ul>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 italic text-center">
        Los nombres, calificaciones y resultado corresponden a una simulación metodológica y no constituyen una recomendación contractual real.
      </p>
    </div>
  );
}
