"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileX2, ArrowRight, CheckCircle2, LogIn, LogOut, RefreshCw,
  AlertTriangle, Shield, User, Lock, Eye, Loader2, Clock,
  ChevronRight, X, UserCheck, AlertCircle
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SessionInfo {
  authenticated: boolean;
  role?: string;
  email?: string;
  displayName?: string;
  demoPersona?: string;
}

interface DemoContext {
  persona: { role: string; email: string; displayName: string };
  partner: { id: string; name: string; code: string; authorizedEmail: string } | null;
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
  version: number;
}

interface HistoryEntry {
  id: string;
  fromState: string;
  toState: string;
  role: string;
  justification: string;
  transitionedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATES_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  Solicitada: { label: "Solicitada", color: "bg-slate-500", bg: "bg-slate-50", border: "border-slate-200" },
  En_Revision: { label: "En Revisión", color: "bg-amber-500", bg: "bg-amber-50", border: "border-amber-200" },
  Aprobada: { label: "Aprobada", color: "bg-emerald-500", bg: "bg-emerald-50", border: "border-emerald-200" },
  Rechazada: { label: "Rechazada", color: "bg-red-500", bg: "bg-red-50", border: "border-red-200" },
  En_Ejecucion: { label: "En Ejecución", color: "bg-teal-500", bg: "bg-teal-50", border: "border-teal-200" },
  Cerrada: { label: "Cerrada", color: "bg-gray-700", bg: "bg-gray-50", border: "border-gray-300" },
};

const PERSONAS = [
  {
    id: "partner_user", label: "Partner Demo Autorizado", role: "BUSINESS_OWNER",
    icon: "user", desc: "Crea solicitudes de anulación",
    can: ["Crear solicitudes", "Consultar sus solicitudes"],
    cannot: ["Aprobar", "Ejecutar", "Cerrar"],
  },
  {
    id: "intern_analyst", label: "Analista Demo", role: "ANALYST",
    icon: "eye", desc: "Revisa y clasifica solicitudes",
    can: ["Solicitada → En Revisión", "Consultar todas"],
    cannot: ["Crear solicitudes", "Aprobar", "Ejecutar", "Cerrar"],
  },
  {
    id: "intern_coordinator", label: "Coordinador Demo", role: "ASSESSMENT_COORDINATOR",
    icon: "check", desc: "Gestiona todo el ciclo de vida",
    can: ["En Revisión → Aprobada/Rechazada", "Aprobada → En Ejecución", "En Ejecución → Cerrada"],
    cannot: ["Solicitada → En Revisión (es del Analista)", "Acceso admin global"],
  },
  {
    id: "intern_readonly", label: "Usuario Solo Lectura", role: "INTERN_READONLY",
    icon: "lock", desc: "Consulta sin modificar",
    can: ["Consultar solicitudes", "Ver historial"],
    cannot: ["Crear", "Cambiar estados", "Modificar datos"],
  },
];

function getStateMeta(state: string) {
  return STATES_META[state] || { label: state, color: "bg-gray-400", bg: "bg-gray-50", border: "border-gray-200" };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

function getNextStates(currentState: string): string[] {
  const map: Record<string, string[]> = {
    Solicitada: ["En_Revision"],
    En_Revision: ["Aprobada", "Rechazada"],
    Aprobada: ["En_Ejecucion"],
    En_Ejecucion: ["Cerrada"],
  };
  return map[currentState] || [];
}

function canRoleTransition(role: string, from: string, to: string): boolean {
  const perms: Record<string, Record<string, string[]>> = {
    Solicitada: { En_Revision: ["OPERATIONS_LEAD", "ANALYST"] },
    En_Revision: {
      Aprobada: ["LEGAL_APPROVER", "VP_APPROVER", "SYSTEM_ADMIN", "ASSESSMENT_COORDINATOR"],
      Rechazada: ["LEGAL_APPROVER", "VP_APPROVER", "SYSTEM_ADMIN", "ASSESSMENT_COORDINATOR"],
    },
    Aprobada: { En_Ejecucion: ["OPERATIONS_LEAD", "SYSTEM_ADMIN", "ASSESSMENT_COORDINATOR"] },
    En_Ejecucion: { Cerrada: ["OPERATIONS_LEAD", "SYSTEM_ADMIN", "ASSESSMENT_COORDINATOR"] },
  };
  return perms[from]?.[to]?.includes(role) || false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AnulacionesPage() {
  const [session, setSession] = useState<SessionInfo>({ authenticated: false });
  const [context, setContext] = useState<DemoContext | null>(null);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Dialog states
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<typeof PERSONAS[0] | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createForm, setCreateForm] = useState({ pqrId: "", justification: "" });
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<{ radicado: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<{ id: string; radicado: string; currentState: string; targetState: string; expectedVersion: number } | null>(null);
  const [transitionJustification, setTransitionJustification] = useState("");
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailData, setDetailData] = useState<{ request: any; history: HistoryEntry[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ─── Session Management ──────────────────────────────────────────────────
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/demo/session/status", { credentials: "same-origin" });
      const data = await res.json();
      setSession(data);
      if (data.authenticated) {
        const ctxRes = await fetch("/api/demo/context", { credentials: "same-origin" });
        if (ctxRes.ok) setContext(await ctxRes.json());
      }
    } catch { setSession({ authenticated: false }); }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  const loadCancellations = useCallback(async () => {
    try {
      const res = await fetch("/api/annulations", { credentials: "same-origin" });
      if (res.ok) { const data = await res.json(); setCancellations(data.data || []); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { if (session.authenticated) loadCancellations(); }, [session.authenticated, loadCancellations]);

  // ─── Login ───────────────────────────────────────────────────────────────
  const handlePersonaClick = (persona: typeof PERSONAS[0]) => {
    setSelectedPersona(persona);
    setLoginError(null);
    setPersonaDialogOpen(true);
  };

  const confirmLogin = async () => {
    if (!selectedPersona) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/demo/session", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId: selectedPersona.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.error?.code === "DEMO_MODE_DISABLED") {
          setLoginError("Modo Demo Assessment no está habilitado en este entorno.");
        } else if (res.status === 500) {
          setLoginError("No fue posible iniciar sesión. Falta configuración de seguridad.");
        } else {
          setLoginError(data.error?.message || "Error al iniciar sesión");
        }
        return;
      }
      // Verify session
      const statusRes = await fetch("/api/demo/session/status", { credentials: "same-origin" });
      const statusData = await statusRes.json();
      if (!statusData.authenticated) { setLoginError("La sesión no se creó correctamente."); return; }
      setSession(statusData);
      const ctxRes = await fetch("/api/demo/context", { credentials: "same-origin" });
      if (ctxRes.ok) setContext(await ctxRes.json());
      setPersonaDialogOpen(false);
      setGlobalSuccess(`Sesión iniciada como ${selectedPersona.label}`);
      setTimeout(() => setGlobalSuccess(null), 4000);
      loadCancellations();
    } catch { setLoginError("Error de red. Verifica tu conexión."); }
    finally { setLoginLoading(false); }
  };

  const logout = async () => {
    await fetch("/api/demo/session", { method: "DELETE", credentials: "same-origin" });
    setSession({ authenticated: false });
    setContext(null);
    setCancellations([]);
    setGlobalSuccess(null);
  };

  const switchPersona = (persona: typeof PERSONAS[0]) => {
    setSelectedPersona(persona);
    setLoginError(null);
    setPersonaDialogOpen(true);
  };

  // ─── Create Annulation ───────────────────────────────────────────────────
  const openCreateDialog = () => {
    setCreateStep(1);
    setCreateForm({ pqrId: "", justification: "" });
    setCreateResult(null);
    setCreateError(null);
    setCreateDialogOpen(true);
  };

  const submitCreate = async () => {
    if (!context?.partner) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/annulations", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: context.partner.id,
          senderEmail: context.partner.authorizedEmail,
          pqrId: createForm.pqrId,
          justification: createForm.justification,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreateResult({ radicado: data.data?.radicado });
        setCreateStep(3);
        loadCancellations();
      } else {
        setCreateError(data.error?.message || "Error al radicar");
      }
    } catch { setCreateError("Error de red"); }
    finally { setCreateLoading(false); }
  };

  // ─── Transition ──────────────────────────────────────────────────────────
  const openTransition = (c: Cancellation, targetState: string) => {
    setTransitionTarget({ id: c.id, radicado: c.radicado, currentState: c.currentState, targetState, expectedVersion: c.version });
    setTransitionJustification("");
    setTransitionError(null);
    setTransitionDialogOpen(true);
  };

  const confirmTransition = async () => {
    if (!transitionTarget) return;
    setTransitionLoading(true);
    setTransitionError(null);
    try {
      const res = await fetch(`/api/annulations/${transitionTarget.id}/transition`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetState: transitionTarget.targetState, justification: transitionJustification, expectedVersion: transitionTarget.expectedVersion }),
      });
      const data = await res.json();
      if (res.ok) {
        setTransitionDialogOpen(false);
        setGlobalSuccess(`${transitionTarget.radicado}: ${getStateMeta(transitionTarget.currentState).label} → ${getStateMeta(transitionTarget.targetState).label}`);
        setTimeout(() => setGlobalSuccess(null), 4000);
        loadCancellations();
      } else {
        const code = data.error?.code;
        if (res.status === 403) setTransitionError(`Permisos insuficientes: ${data.error?.message}`);
        else if (res.status === 422 || res.status === 409) setTransitionError(`Transición inválida: ${data.error?.message}`);
        else setTransitionError(data.error?.message || "Error");
      }
    } catch { setTransitionError("Error de red"); }
    finally { setTransitionLoading(false); }
  };

  // ─── Detail / History ────────────────────────────────────────────────────
  const openDetail = async (c: Cancellation) => {
    setDetailData(null);
    setDetailLoading(true);
    setDetailDialogOpen(true);
    try {
      const res = await fetch(`/api/annulations/${c.id}/history`, { credentials: "same-origin" });
      if (res.ok) setDetailData(await res.json());
    } catch { /* show empty */ }
    finally { setDetailLoading(false); }
  };

  // ─── Reset ───────────────────────────────────────────────────────────────
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const confirmReset = async () => {
    setResetLoading(true);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST", credentials: "same-origin" });
      if (res.ok) {
        setResetDialogOpen(false);
        setGlobalSuccess("Datos demo restablecidos correctamente");
        setTimeout(() => setGlobalSuccess(null), 4000);
        loadCancellations();
      }
    } catch { /* silent */ }
    finally { setResetLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Global Feedback */}
      {globalError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm animate-in fade-in">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{globalError}</span>
          <button onClick={() => setGlobalError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {globalSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm animate-in fade-in">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{globalSuccess}</span>
        </div>
      )}

      {/* SIMULATED_DATA Banner */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
        <Shield size={14} className="shrink-0" />
        <span>SIMULATED_DATA — Datos simulados exclusivamente para demostración del assessment. No conectado a sistemas productivos de Vanti.</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
            <FileX2 size={20} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Anulaciones — Assessment Demo</h1>
            <p className="text-xs text-gray-500">Máquina de estados con autenticación, RBAC y auditoría</p>
          </div>
        </div>
      </div>

      {/* Session Bar */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        {session.authenticated ? (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                <UserCheck size={16} className="text-green-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{session.displayName}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{session.role}</span>
                  <span className="text-[10px] text-gray-500">{session.email}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {session.role === "BUSINESS_OWNER" && (
                <button onClick={openCreateDialog} className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-medium transition-colors">
                  + Nueva solicitud
                </button>
              )}
              {(session.role === "SYSTEM_ADMIN" || session.role === "ASSESSMENT_COORDINATOR") && (
                <button onClick={() => setResetDialogOpen(true)} className="flex items-center gap-1.5 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1.5 rounded-lg transition-colors">
                  <RefreshCw size={12} /> Reset Demo
                </button>
              )}
              <button onClick={() => { setSelectedPersona(null); setLoginError(null); setPersonaDialogOpen(true); }} className="text-xs text-gray-600 hover:text-gray-800 px-3 py-1.5 border rounded-lg transition-colors">
                Cambiar persona
              </button>
              <button onClick={logout} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 px-3 py-1.5 border border-red-200 rounded-lg transition-colors">
                <LogOut size={12} /> Salir
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <LogIn size={16} className="text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-800">Modo Demo Assessment</h2>
            </div>
            <p className="text-xs text-gray-600 mb-4">Selecciona una persona para iniciar sesión de demostración:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PERSONAS.map((p) => (
                <button key={p.id} onClick={() => handlePersonaClick(p)} className="text-left p-3 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all group">
                  <div className="flex items-center gap-2 mb-1">
                    {p.icon === "user" && <User size={14} className="text-blue-600" />}
                    {p.icon === "eye" && <Eye size={14} className="text-amber-600" />}
                    {p.icon === "check" && <CheckCircle2 size={14} className="text-green-600" />}
                    {p.icon === "lock" && <Lock size={14} className="text-gray-500" />}
                    <span className="text-xs font-semibold text-gray-800 group-hover:text-blue-700">{p.label}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 leading-tight block">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {session.role === "INTERN_READONLY" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-100">
            <Lock size={12} /> Modo solo lectura — puede consultar pero no modificar solicitudes.
          </div>
        )}
      </div>

      {/* State Machine Diagram */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Flujo de Estados</h2>
        <div className="flex flex-col items-center gap-3 overflow-x-auto py-2">
          <div className="flex items-center gap-1.5 min-w-[550px]">
            {["Solicitada", "En_Revision", "Aprobada", "En_Ejecucion", "Cerrada"].map((s, i, arr) => (
              <React.Fragment key={s}>
                <div className={`${getStateMeta(s).color} text-white text-[10px] font-bold px-2.5 py-1.5 rounded-md whitespace-nowrap`}>
                  {getStateMeta(s).label}
                </div>
                {i < arr.length - 1 && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span>Alternativa desde En Revisión:</span>
            <ChevronRight size={12} className="text-red-300" />
            <div className="bg-red-500 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-md">Rechazada</div>
            <span>(terminal)</span>
          </div>
        </div>
      </div>

      {/* Cancellations Table */}
      {session.authenticated && (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Solicitudes de Anulación</h2>
            <button onClick={loadCancellations} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <RefreshCw size={11} /> Actualizar
            </button>
          </div>
          {cancellations.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No hay solicitudes. {session.role === "BUSINESS_OWNER" && "Crea la primera."}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Radicado</th>
                    <th className="px-4 py-2.5 text-left font-medium">PQR</th>
                    <th className="px-4 py-2.5 text-center font-medium">Estado</th>
                    <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
                    <th className="px-4 py-2.5 text-center font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cancellations.map((c) => {
                    const meta = getStateMeta(c.currentState);
                    const nextStates = getNextStates(c.currentState);
                    const allowedNext = nextStates.filter((ns) => canRoleTransition(session.role || "", c.currentState, ns));
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-mono font-medium text-gray-800">{c.radicado}</td>
                        <td className="px-4 py-2.5 text-gray-600">{c.pqrId || "—"}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block ${meta.color} text-white text-[9px] font-bold px-2 py-0.5 rounded`}>{meta.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{formatDate(c.createdAt)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex gap-1 justify-center flex-wrap">
                            <button onClick={() => openDetail(c)} className="text-[10px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors">
                              Detalle
                            </button>
                            {allowedNext.map((ns) => (
                              <button key={ns} onClick={() => openTransition(c, ns)} className="text-[10px] px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium border border-blue-200 transition-colors">
                                → {getStateMeta(ns).label}
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
          )}
        </div>
      )}

      {/* Not authenticated */}
      {!session.authenticated && (
        <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
          <AlertCircle size={28} className="text-amber-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800">Sesión requerida</p>
          <p className="text-xs text-gray-500 mt-1">Para gestionar solicitudes de anulación, selecciona una persona demo arriba.</p>
        </div>
      )}

      {/* ═══════════════════ DIALOGS ═══════════════════ */}

      {/* Persona Login Dialog */}
      <Dialog.Root open={personaDialogOpen} onOpenChange={setPersonaDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 animate-in fade-in z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-white rounded-xl shadow-xl p-6 z-50 animate-in fade-in zoom-in-95">
            <Dialog.Title className="text-lg font-bold text-gray-900 mb-1">
              {selectedPersona ? "Ingresar como" : "Seleccionar Persona"}
            </Dialog.Title>
            {selectedPersona ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                    {selectedPersona.icon === "user" && <User size={18} className="text-blue-600" />}
                    {selectedPersona.icon === "eye" && <Eye size={18} className="text-amber-600" />}
                    {selectedPersona.icon === "check" && <CheckCircle2 size={18} className="text-green-600" />}
                    {selectedPersona.icon === "lock" && <Lock size={18} className="text-gray-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{selectedPersona.label}</p>
                    <p className="text-[10px] text-gray-500">{selectedPersona.role}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="font-medium text-green-700 mb-1">Puede:</p>
                    {selectedPersona.can.map((c) => <p key={c} className="text-gray-600 flex items-center gap-1"><CheckCircle2 size={10} className="text-green-500" />{c}</p>)}
                  </div>
                  <div>
                    <p className="font-medium text-red-700 mb-1">No puede:</p>
                    {selectedPersona.cannot.map((c) => <p key={c} className="text-gray-600 flex items-center gap-1"><X size={10} className="text-red-400" />{c}</p>)}
                  </div>
                </div>
                {loginError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{loginError}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Dialog.Close asChild>
                    <button className="flex-1 px-4 py-2.5 text-sm border rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
                  </Dialog.Close>
                  <button onClick={confirmLogin} disabled={loginLoading} className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-medium transition-colors flex items-center justify-center gap-2">
                    {loginLoading ? <><Loader2 size={14} className="animate-spin" /> Iniciando…</> : <><LogIn size={14} /> Ingresar</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 mt-3">
                {PERSONAS.map((p) => (
                  <button key={p.id} onClick={() => { setSelectedPersona(p); setLoginError(null); }} className="w-full text-left p-3 rounded-lg border hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-3">
                    {p.icon === "user" && <User size={16} className="text-blue-600" />}
                    {p.icon === "eye" && <Eye size={16} className="text-amber-600" />}
                    {p.icon === "check" && <CheckCircle2 size={16} className="text-green-600" />}
                    {p.icon === "lock" && <Lock size={16} className="text-gray-500" />}
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.label}</p>
                      <p className="text-[10px] text-gray-500">{p.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Create Annulation Dialog */}
      <Dialog.Root open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-lg bg-white rounded-xl shadow-xl p-6 z-50">
            <Dialog.Title className="text-lg font-bold text-gray-900 mb-4">
              {createStep === 1 && "Nueva Solicitud de Anulación"}
              {createStep === 2 && "Confirmar Solicitud"}
              {createStep === 3 && "Solicitud Radicada"}
            </Dialog.Title>
            {createStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg text-xs">
                  <div><span className="text-gray-500">Aliado:</span><p className="font-medium text-gray-800">{context?.partner?.name || "—"}</p></div>
                  <div><span className="text-gray-500">Correo:</span><p className="font-medium text-gray-800 flex items-center gap-1">{context?.partner?.authorizedEmail} <CheckCircle2 size={10} className="text-green-500" /></p></div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">PQR / Referencia</label>
                  <input type="text" value={createForm.pqrId} onChange={(e) => setCreateForm({ ...createForm, pqrId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="PQR-POC-001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Justificación <span className="text-gray-400">(mín. 10 caracteres)</span></label>
                  <textarea value={createForm.justification} onChange={(e) => setCreateForm({ ...createForm, justification: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" placeholder="Motivo detallado de la solicitud de anulación" />
                  <p className="text-[10px] text-gray-400 mt-1">{createForm.justification.length} / mín. 10</p>
                </div>
                {createError && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{createError}</p>}
                <div className="flex gap-2 pt-2">
                  <Dialog.Close asChild><button className="flex-1 px-4 py-2.5 text-sm border rounded-lg">Cancelar</button></Dialog.Close>
                  <button onClick={() => setCreateStep(2)} disabled={!createForm.pqrId || createForm.justification.trim().length < 10} className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 font-medium transition-colors">Continuar</button>
                </div>
              </div>
            )}
            {createStep === 2 && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Aliado:</span><span className="font-medium">{context?.partner?.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Correo:</span><span className="font-medium">{context?.partner?.authorizedEmail}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">PQR:</span><span className="font-medium">{createForm.pqrId}</span></div>
                  <div><span className="text-gray-500">Justificación:</span><p className="font-medium mt-1">{createForm.justification}</p></div>
                </div>
                <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded-lg">Al radicar, la solicitud iniciará en estado <strong>SOLICITADA</strong>.</p>
                {createError && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{createError}</p>}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setCreateStep(1)} className="flex-1 px-4 py-2.5 text-sm border rounded-lg">Atrás</button>
                  <button onClick={submitCreate} disabled={createLoading} className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-medium flex items-center justify-center gap-2 transition-colors">
                    {createLoading ? <><Loader2 size={14} className="animate-spin" /> Radicando…</> : "Radicar solicitud"}
                  </button>
                </div>
              </div>
            )}
            {createStep === 3 && createResult && (
              <div className="text-center space-y-4 py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mx-auto"><CheckCircle2 size={28} className="text-green-600" /></div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Solicitud radicada exitosamente</p>
                  <p className="text-lg font-mono font-bold text-blue-700 mt-2">{createResult.radicado}</p>
                  <p className="text-xs text-gray-500 mt-1">Estado: SOLICITADA</p>
                </div>
                <Dialog.Close asChild><button className="px-6 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Cerrar</button></Dialog.Close>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Transition Dialog */}
      <Dialog.Root open={transitionDialogOpen} onOpenChange={setTransitionDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-white rounded-xl shadow-xl p-6 z-50">
            <Dialog.Title className="text-lg font-bold text-gray-900 mb-4">Cambiar Estado</Dialog.Title>
            {transitionTarget && (
              <div className="space-y-4">
                <div className="text-xs space-y-2 bg-gray-50 rounded-lg p-3">
                  <p><span className="text-gray-500">Radicado:</span> <span className="font-mono font-medium">{transitionTarget.radicado}</span></p>
                  <div className="flex items-center gap-2">
                    <span className={`${getStateMeta(transitionTarget.currentState).color} text-white text-[9px] font-bold px-2 py-0.5 rounded`}>{getStateMeta(transitionTarget.currentState).label}</span>
                    <ArrowRight size={14} className="text-gray-400" />
                    <span className={`${getStateMeta(transitionTarget.targetState).color} text-white text-[9px] font-bold px-2 py-0.5 rounded`}>{getStateMeta(transitionTarget.targetState).label}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Justificación <span className="text-gray-400">(mín. 10 caracteres)</span></label>
                  <textarea value={transitionJustification} onChange={(e) => setTransitionJustification(e.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" placeholder="Razón del cambio de estado" />
                  <p className="text-[10px] text-gray-400 mt-1">{transitionJustification.length} / mín. 10</p>
                </div>
                {transitionError && <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">{transitionError}</p>}
                <div className="flex gap-2 pt-2">
                  <Dialog.Close asChild><button className="flex-1 px-4 py-2.5 text-sm border rounded-lg">Cancelar</button></Dialog.Close>
                  <button onClick={confirmTransition} disabled={transitionLoading || transitionJustification.trim().length < 10} className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 font-medium flex items-center justify-center gap-2 transition-colors">
                    {transitionLoading ? <><Loader2 size={14} className="animate-spin" /> Actualizando…</> : "Confirmar cambio"}
                  </button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Detail / History Dialog */}
      <Dialog.Root open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-xl bg-white rounded-xl shadow-xl p-6 z-50 max-h-[80vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-gray-900 mb-4">Detalle de Solicitud</Dialog.Title>
            {detailLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
            ) : detailData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-4 text-xs">
                  <div><span className="text-gray-500">Radicado:</span><p className="font-mono font-bold text-gray-800">{detailData.request.radicado}</p></div>
                  <div><span className="text-gray-500">PQR:</span><p className="font-medium">{detailData.request.pqrId}</p></div>
                  <div><span className="text-gray-500">Estado:</span><p><span className={`${getStateMeta(detailData.request.currentState).color} text-white text-[9px] font-bold px-2 py-0.5 rounded`}>{getStateMeta(detailData.request.currentState).label}</span></p></div>
                  <div><span className="text-gray-500">Creado:</span><p className="font-medium">{formatDate(detailData.request.createdAt)}</p></div>
                  <div className="col-span-2"><span className="text-gray-500">Justificación:</span><p className="font-medium mt-1">{detailData.request.justification}</p></div>
                </div>
                {/* Timeline */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2"><Clock size={14} /> Historial del Proceso</h3>
                  <div className="space-y-0">
                    {/* Creation event */}
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-100 shrink-0" />
                        {detailData.history.length > 0 && <div className="w-0.5 flex-1 bg-gray-200" />}
                      </div>
                      <div className="pb-4">
                        <p className="text-xs font-medium text-gray-800">Solicitud radicada</p>
                        <p className="text-[10px] text-gray-500">{formatDate(detailData.request.createdAt)} · Partner</p>
                      </div>
                    </div>
                    {/* Transitions */}
                    {detailData.history.map((h, i) => (
                      <div key={h.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full ${getStateMeta(h.toState).color} ring-2 ring-offset-1 ring-gray-100 shrink-0`} />
                          {i < detailData.history.length - 1 && <div className="w-0.5 flex-1 bg-gray-200" />}
                        </div>
                        <div className="pb-4">
                          <p className="text-xs font-medium text-gray-800">{getStateMeta(h.fromState).label} → {getStateMeta(h.toState).label}</p>
                          <p className="text-[10px] text-gray-500">{formatDate(h.transitionedAt)} · {h.role}</p>
                          {h.justification && <p className="text-[10px] text-gray-600 italic mt-0.5">&ldquo;{h.justification}&rdquo;</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-[10px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">SIMULATED_DATA — Datos de demostración del assessment.</div>
                <Dialog.Close asChild><button className="w-full px-4 py-2.5 text-sm border rounded-lg mt-2 hover:bg-gray-50">Cerrar</button></Dialog.Close>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No se pudo cargar el detalle.</p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Reset Confirmation Dialog */}
      <Dialog.Root open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-sm bg-white rounded-xl shadow-xl p-6 z-50">
            <Dialog.Title className="text-lg font-bold text-gray-900 mb-2">Restablecer Datos Demo</Dialog.Title>
            <p className="text-sm text-gray-600 mb-4">Se eliminarán todas las solicitudes demo y se recrearán los 6 casos semilla en sus estados iniciales.</p>
            <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded mb-4">Solo afecta datos SIMULATED_DATA. Los 51.008 registros PQR reales no se modifican.</p>
            <div className="flex gap-2">
              <Dialog.Close asChild><button className="flex-1 px-4 py-2.5 text-sm border rounded-lg">Cancelar</button></Dialog.Close>
              <button onClick={confirmReset} disabled={resetLoading} className="flex-1 px-4 py-2.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-amber-300 font-medium flex items-center justify-center gap-2">
                {resetLoading ? <><Loader2 size={14} className="animate-spin" /> Restableciendo…</> : "Confirmar Reset"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
