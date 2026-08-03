/**
 * Shared state for the email validation module.
 * Separated from route.ts to avoid Next.js route export restrictions.
 */

export interface AuditEvent {
  action: string;
  email: string;
  timestamp: string;
  reason: string;
  ip: string;
}

export const auditLog: AuditEvent[] = [];

export function getAuditLog(): AuditEvent[] {
  return auditLog;
}

export function resetAuditLog(): void {
  auditLog.length = 0;
}
