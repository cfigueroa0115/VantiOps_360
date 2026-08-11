export const ONBOARDING_STATES = [
  { key: "BORRADOR", label: "Borrador", order: 1 },
  { key: "ENVIADO", label: "Enviado", order: 2 },
  { key: "REVISION_LEGAL", label: "Revisión Legal", order: 3 },
  { key: "DEVUELTO_CORRECCION", label: "Devuelto para corrección", order: 3.5 },
  { key: "REVISION_VP", label: "Revisión VP", order: 4 },
  { key: "APROBADO", label: "Aprobado", order: 5 },
  { key: "RECHAZADO", label: "Rechazado", order: 5 },
  { key: "OPERATIVO", label: "Operativo", order: 6 },
];

export const TRACEABILITY_LOG = [
  {
    fecha: "2024-11-15",
    actor: "Camila Restrepo",
    rol: "LEGAL_APPROVER",
    decision: "Devuelto para corrección",
    comentario: "Falta cláusula de confidencialidad en el contrato.",
    estadoAnterior: "Revisión Legal",
    estadoNuevo: "Devuelto para corrección",
  },
  {
    fecha: "2024-11-22",
    actor: "Camila Restrepo",
    rol: "LEGAL_APPROVER",
    decision: "Aprobado Legal",
    comentario: "Contrato corregido y conforme.",
    estadoAnterior: "Revisión Legal",
    estadoNuevo: "Revisión VP",
  },
  {
    fecha: "2024-12-03",
    actor: "Andrés Villamil",
    rol: "VP_APPROVER",
    decision: "Rechazado",
    comentario: "No se justifica presupuestalmente para Q1 2025.",
    estadoAnterior: "Revisión VP",
    estadoNuevo: "Rechazado",
  },
];
