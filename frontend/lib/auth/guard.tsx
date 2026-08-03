"use client";

import React, { type ReactNode } from "react";
import type { Role } from "@/middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthGuardProps {
  /** Roles that are allowed to see the children content. */
  allowedRoles: Role[];
  /** Content to render when the user is authorized. */
  children: ReactNode;
  /** Optional fallback UI to show when the user is not authorized. */
  fallback?: ReactNode;
  /** The current user's role. If undefined/null, access is denied. */
  userRole?: Role | null;
}

// ---------------------------------------------------------------------------
// Default Fallback
// ---------------------------------------------------------------------------

/**
 * Default fallback component shown when a user does not have the required role.
 * Displays a message instructing them to contact SYSTEM_ADMIN.
 *
 * Requirements: REQ-13.3, REQ-13.6
 */
function DefaultFallback() {
  return (
    <div
      className="flex items-center justify-center p-8"
      role="alert"
      aria-live="polite"
    >
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">
          Acceso Restringido
        </h2>
        <p className="text-sm text-gray-500">
          No tienes permisos para ver este contenido.
          Contacta al administrador del sistema (SYSTEM_ADMIN) para obtener un rol adecuado.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthGuard Component
// ---------------------------------------------------------------------------

/**
 * Client-side authorization guard component.
 *
 * Renders `children` only when the user's role is included in the
 * `allowedRoles` list. Otherwise renders the `fallback` (or a default
 * access-denied message).
 *
 * This guard provides a complementary client-side layer on top of the
 * Next.js middleware that performs server-side RBAC enforcement.
 *
 * Usage:
 * ```tsx
 * <AuthGuard allowedRoles={["SYSTEM_ADMIN", "OPERATIONS_LEAD"]} userRole={session.role}>
 *   <AdminPanel />
 * </AuthGuard>
 * ```
 *
 * Requirements: REQ-13.3, REQ-13.6
 */
export function AuthGuard({
  allowedRoles,
  children,
  fallback,
  userRole,
}: AuthGuardProps): ReactNode {
  // If the user has no role or their role is not in the allowed list, deny access
  if (!userRole || !allowedRoles.includes(userRole)) {
    return fallback ?? <DefaultFallback />;
  }

  return <>{children}</>;
}
