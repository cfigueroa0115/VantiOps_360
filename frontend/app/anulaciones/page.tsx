"use client";

import React, { useState, useEffect, useCallback } from "react";
import { FileX2, ArrowRight, CheckCircle2, LogIn, LogOut, RefreshCw, AlertTriangle, Shield } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionInfo {
  authenticated: boolean;
  role?: string;
  email?: string;
  displayName?: string;
  demoPersona?: string;
}

interface Cancellation {
  id: string;
  radicado: string;
  pqrId: string | null;
  currentState: string;
  requestedBy: string;
  justification: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATES = [
  { key: "Solicitada", label: "Solicitada", color: "bg-gray-500" },
  { key: "En_Revision", label: "En Revisión", color: "bg-amber-500" },
  { key: "Aprobada", label: "Aprobada", color: "bg-emerald-500" },
  { key: "Rechazada", label: "Rechazada", color: "bg-red-500" },
  { key: "En_Ejecucion", label: "En Ejecución", color: "bg-teal-500" },
  { key: "Cerrada", label: "Cerrada", color: "bg-slate-500" },
];

const DEMO_PERSONAS = [
  { id: "partner_user", label: "Partner Demo Autorizado", role: "BUSINESS_OWNER", desc: "Puede crear solicitudes" },
  { id: "intern_analyst", label: "Analista Demo", role: "ANALYST", desc: "Puede revisar solicitudes" },
  { id: "intern_coordinator", label: "Coordinador Demo", role: "SYSTEM_ADMIN", desc: "Puede recorrer todo el flujo" },
  { id: "intern_readonly", label: "Usuario Solo Lectura", role: "INTERN_READONLY", desc: "Solo consulta, no puede cambiar estado" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStateInfo(state: string) {
  return STATES.find((s) => s.key === state) || { key: state, label: state, color: "bg-gray-400" };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StateMachineViz() {
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 overflow-x-auto">
      <div className="flex flex-col items-center gap-4 min-w-[600px]">
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

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AnulacionesPage() {
  const [session, setSession] = useState<SessionInfo>({ authenticated: false });
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState({ partnerId: "", senderEmail: "", pqrId: "", justification: "" });
  const [result, setResult] = useState<{ type: "success" | "error"; message: string; radicado?: string } | null>(null);
  const [transitionResult, setTransitionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // --- Session ---
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/demo/session/status");
      const data = await res.json();
      setSession(data);
    } catch {
      setSession({ authenticated: false });
    }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  const loginAs = async (personaId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/demo/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId }),
      });
      if (res.ok) {
        await checkSession();
        await loadCancellations();
      } else {
        const data = await res.json();
        setResult({ type: "error", message: data.error?.message || "Error al iniciar sesión" });
      }
    } catch { setResult({ type: "error", message: "Error de red" }); }
    finally { setLoading(false); }
  };

  const logout = async () => {
    await fetch("/api/demo/session", { method: "DELETE" });
    setSession({ authenticated: false });
    setCancellations([]);
  };

  // --- Load Cancellations ---
  const loadCancellations = useCallback(async () => {
    try {
      const res = await fetch("/api/annulations");
      if (res.ok) {
        const data = await res.json();
        setCancellations(data.data || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { if (session.authenticated) loadCancellations(); }, [session.authenticated, loadCancellations]);

  // --- Create Annulation ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/annulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ type: "success", message: "Solicitud radicada exitosamente", radicado: data.data?.radicado });
        setFormState({ partnerId: "", senderEmail: "", pqrId: "", justification: "" });
        await loadCancellations();
      } else {
        setResult({ type: "error", message: data.error?.message || "Error" });
      }
    } catch { setResult({ type: "error", message: "Error de red" }); }
    finally { setLoading(false); }
  };

  // --- Transition ---
  const doTransition = async (id: string, targetState: string) => {
    setTransitionResult(null);
    const justification = prompt("Justificación (mín. 10 caracteres):");
    if (!justification || justification.trim().length < 10) {
      setTransitionResult({ type: "error", message: "Justificación debe tener al menos 10 caracteres" });
      return;
    }
    try {
      const res = await fetch(`/api/annulations/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetState, justification }),
      });
      const data = await res.json();
      if (res.ok) {
        setTransitionResult({ type: "success", message: data.message || "Transición ejecutada" });
        await loadCancellations();
      } else {
        setTransitionResult({ type: "error", message: `[${res.status}] ${data.error?.message || "Error"}` });
      }
    } catch { setTransitionResult({ type: "error", message: "Error de red" }); }
  };

  // --- Reset Demo ---
  const resetDemo = async () => {
    if (!confirm("¿Restablecer datos demo a estado inicial?")) return;
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      if (res.ok) {
        setTransitionResult({ type: "success", message: "Datos demo restablecidos" });
        await loadCancellations();
      } else {
        const data = await res.json();
        setTransitionResult({ type: "error", message: data.error?.message || "Error" });
      }
    } catch { setTransitionResult({ type: "error", message: "Error de red" }); }
  };

  // --- Valid transitions for current role ---
  const getNextStates = (currentState: string): string[] => {
    const transitions: Record<string, string[]> = {
      Solicitada: ["En_Revision"],
      En_Revision: ["Aprobada", "Rechazada"],
      Aprobada: ["En_Ejecucion"],
      En_Ejecucion: ["Cerrada"],
    };
    return transitions[currentState] || [];
  };

  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
        <Shield size={16} />
        <span>SIMULATED_DATA — Datos simulados exclusivamente para demostración del assessment.</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
          <FileX2 size={20} className="text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Anulaciones — Máquina de Estados</h1>
          <p className="text-sm text-gray-500">Flujo controlado de cancelación de servicios</p>
        </div>
      </div>

      {/* Session Panel */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="text-sm font-semibold text-blue-800 mb-3">Modo Demo Assessment</h2>
        {session.authenticated ? (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-gray-800">{session.displayName}</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{session.role}</span>
            </div>
            <div className="flex gap-2">
              {session.role === "SYSTEM_ADMIN" && (
                <button onClick={resetDemo} className="flex items-center gap-1.5 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1.5 rounded-lg transition-colors">
                  <RefreshCw size={12} /> Restablecer Demo
                </button>
              )}
              <button onClick={logout} className="flex items-center gap-1.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg transition-colors">
                <LogOut size={12} /> Cerrar sesión
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-blue-700 mb-3">Selecciona una persona demo para iniciar sesión:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {DEMO_PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loginAs(p.id)}
                  disabled={loading}
                  className="text-left p-3 rounded-lg border border-blue-200 bg-white hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-1.5">
                    <LogIn size={12} className="text-blue-600" />
                    <span className="text-xs font-semibold text-gray-800">{p.label}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-0.5 block">{p.role} — {p.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* State Machine Visualization */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Flujo de Estados</h2>
        <StateMachineViz />
      </div>

      {/* Create Form (only if authenticated with right role) */}
      {session.authenticated && (session.role === "BUSINESS_OWNER" || session.role === "SYSTEM_ADMIN") && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Nueva Solicitud de Anulación</h2>
          {result && (
            <div className={`flex items-center gap-2 mb-4 rounded-lg p-3 border ${result.type === "success" ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>
              {result.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <div>
                <span className="text-sm">{result.message}</span>
                {result.radicado && <p className="text-xs font-mono mt-0.5">{result.radicado}</p>}
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Partner ID</label>
              <input type="text" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="UUID del aliado" value={formState.partnerId} onChange={(e) => setFormState({ ...formState, partnerId: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Correo Remitente</label>
              <input type="email" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="partner.demo01@example.com" value={formState.senderEmail} onChange={(e) => setFormState({ ...formState, senderEmail: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">PQR / Referencia</label>
              <input type="text" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="PQR-POC-001" value={formState.pqrId} onChange={(e) => setFormState({ ...formState, pqrId: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Justificación (mín. 10 caracteres)</label>
              <input type="text" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Motivo detallado de la solicitud" value={formState.justification} onChange={(e) => setFormState({ ...formState, justification: e.target.value })} required minLength={10} />
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={loading} className="px-5 py-2 text-white text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 transition-colors">
                {loading ? "Procesando..." : "Radicar Solicitud"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Not authenticated prompt */}
      {!session.authenticated && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <AlertTriangle size={24} className="text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-800">Sesión requerida</p>
          <p className="text-xs text-gray-500 mt-1">Para radicar una solicitud o gestionar anulaciones, inicia sesión con un usuario demo arriba.</p>
        </div>
      )}

      {/* Transition Result */}
      {transitionResult && (
        <div className={`rounded-lg p-3 border ${transitionResult.type === "success" ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>
          <span className="text-sm">{transitionResult.message}</span>
        </div>
      )}

      {/* Cancellations Table */}
      {session.authenticated && cancellations.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Solicitudes de Anulación</h2>
            <button onClick={loadCancellations} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <RefreshCw size={12} /> Actualizar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Radicado</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">PQR</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cancellations.map((c) => {
                  const stateInfo = getStateInfo(c.currentState);
                  const nextStates = getNextStates(c.currentState);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs font-medium">{c.radicado}</td>
                      <td className="px-4 py-3 text-xs">{c.pqrId || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block ${stateInfo.color} text-white text-[10px] font-bold px-2 py-0.5 rounded`}>
                          {stateInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center flex-wrap">
                          {nextStates.map((ns) => (
                            <button
                              key={ns}
                              onClick={() => doTransition(c.id, ns)}
                              className="text-[10px] px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium transition-colors"
                            >
                              → {getStateInfo(ns).label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 italic text-center">
        SIMULATED_DATA — Prototipo independiente. No conectado a sistemas productivos de Vanti.
      </p>
    </div>
  );
}
