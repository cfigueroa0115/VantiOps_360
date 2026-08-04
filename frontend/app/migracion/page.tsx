"use client";

import React, { useState, useEffect } from "react";
import { ArrowRightLeft, Play, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";

const STAGES = [
  { key: "discovery", label: "Discovery", description: "Identificación de fuentes y esquemas" },
  { key: "profiling", label: "Profiling", description: "Análisis estadístico y detección de anomalías" },
  { key: "mapping", label: "Mapping", description: "Transformación y mapeo de campos" },
  { key: "quality_gate", label: "Quality Gate", description: "Validación de reglas de calidad" },
  { key: "load", label: "Load", description: "Carga a destino (Neon PostgreSQL)" },
  { key: "reconciliation", label: "Reconciliation", description: "Verificación de integridad post-carga" },
];

const INITIAL_STATS = {
  total: 600,
  accepted: 0,
  warnings: 0,
  quarantined: 0,
  rejected: 0,
  migrated: 0,
};

const FINAL_STATS = {
  total: 600,
  accepted: 542,
  warnings: 31,
  quarantined: 18,
  rejected: 9,
  migrated: 542,
};

export default function MigracionPage() {
  const [running, setRunning] = useState(false);
  const [currentStage, setCurrentStage] = useState(-1);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [progress, setProgress] = useState(0);

  const runSimulation = () => {
    setRunning(true);
    setCurrentStage(0);
    setStats(INITIAL_STATS);
    setProgress(0);

    let stage = 0;
    const interval = setInterval(() => {
      stage++;
      setCurrentStage(stage);
      setProgress(Math.round(((stage + 1) / STAGES.length) * 100));

      if (stage >= STAGES.length - 1) {
        clearInterval(interval);
        setStats(FINAL_STATS);
        setRunning(false);
      } else {
        // Incremental stats
        const factor = (stage + 1) / STAGES.length;
        setStats({
          total: 600,
          accepted: Math.round(FINAL_STATS.accepted * factor),
          warnings: Math.round(FINAL_STATS.warnings * factor),
          quarantined: Math.round(FINAL_STATS.quarantined * factor),
          rejected: Math.round(FINAL_STATS.rejected * factor),
          migrated: Math.round(FINAL_STATS.migrated * factor),
        });
      }
    }, 1200);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
        Datos simulados exclusivamente para demostración conceptual.
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100">
          <ArrowRightLeft size={20} className="text-cyan-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Migración de Datos</h1>
          <p className="text-sm text-gray-500">Simulación conceptual independiente de migración de registros PQR</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-[10px] text-gray-500">Total Registros</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{stats.accepted}</p>
          <p className="text-[10px] text-green-600">Aceptados</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{stats.warnings}</p>
          <p className="text-[10px] text-amber-600">Advertencias</p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center">
          <p className="text-2xl font-bold text-orange-700">{stats.quarantined}</p>
          <p className="text-[10px] text-orange-600">Cuarentena</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
          <p className="text-[10px] text-red-600">Rechazados</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{stats.migrated}</p>
          <p className="text-[10px] text-blue-600">Migrados</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Progreso de Migración</h2>
          <button
            onClick={runSimulation}
            disabled={running}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              running
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            <Play size={14} />
            {running ? "Ejecutando..." : "Iniciar Simulación"}
          </button>
        </div>

        <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 text-right">{progress}% completado</p>
      </div>

      {/* Pipeline Stages */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Etapas del Pipeline</h2>
        <div className="space-y-3">
          {STAGES.map((stage, i) => {
            const isCompleted = i <= currentStage;
            const isCurrent = i === currentStage && running;
            return (
              <div
                key={stage.key}
                className={`flex items-center gap-4 p-3 rounded-lg border transition-all ${
                  isCurrent
                    ? "border-blue-300 bg-blue-50"
                    : isCompleted
                    ? "border-green-200 bg-green-50"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isCurrent
                    ? "bg-blue-500"
                    : isCompleted
                    ? "bg-green-500"
                    : "bg-gray-300"
                }`}>
                  {isCurrent ? (
                    <Clock size={14} className="text-white animate-spin" />
                  ) : isCompleted ? (
                    <CheckCircle2 size={14} className="text-white" />
                  ) : (
                    <span className="text-white text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${isCompleted ? "text-green-800" : "text-gray-700"}`}>
                    {stage.label}
                  </p>
                  <p className="text-xs text-gray-500">{stage.description}</p>
                </div>
                {isCompleted && !isCurrent && (
                  <span className="text-[10px] text-green-600 font-medium">Completado</span>
                )}
                {isCurrent && (
                  <span className="text-[10px] text-blue-600 font-medium animate-pulse">En proceso...</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Reconciliation Summary */}
      {stats.migrated > 0 && !running && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} className="text-green-600" />
            <h2 className="text-lg font-semibold text-green-800">Resultado esperado de la simulación</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Tasa de éxito</p>
              <p className="font-bold text-green-800">{((stats.migrated / stats.total) * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-gray-600">Integridad FK</p>
              <p className="font-bold text-green-800">Validación de integridad propuesta</p>
            </div>
            <div>
              <p className="text-gray-600">Checksums</p>
              <p className="font-bold text-green-800">Verificación de checksums contemplada</p>
            </div>
            <div>
              <p className="text-gray-600">Destino</p>
              <p className="font-bold text-green-800">Neon PostgreSQL</p>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 italic text-center">
        Simulación conceptual de la estrategia de migración. No ejecuta una migración productiva ni modifica registros existentes.
      </p>
    </div>
  );
}
