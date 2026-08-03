/**
 * Next.js RBAC Middleware for VantiOps 360.
 *
 * Validates JWT-based role claims against a PROTECTED_ROUTES configuration.
 * - API routes (/api/*): returns JSON 403 for unauthorized, 401 for unauthenticated.
 * - Page routes: redirects to /access-denied for unauthorized, /login for unauthenticated.
 * - Validation is purely local (JWT decode + signature verify, no DB queries).
 * - Target: < 500ms validation time.
 *
 * Requirements: REQ-13.3, REQ-13.4, REQ-13.5
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Role =
  | "SYSTEM_ADMIN"
  | "OPERATIONS_LEAD"
  | "ANALYST"
  | "LEGAL_APPROVER"
  | "VP_APPROVER"
  | "BUSINESS_OWNER"
  | "AUDITOR"
  | "PARTNER_ADMIN"
  | "PARTNER_OPERATOR"
  | "CONTRACTOR_OPERATOR"
  | "INTERN_READONLY";

export const VALID_ROLES: readonly Role[] = [
  "SYSTEM_ADMIN",
  "OPERATIONS_LEAD",
  "ANALYST",
  "LEGAL_APPROVER",
  "VP_APPROVER",
  "BUSINESS_OWNER",
  "AUDITOR",
  "PARTNER_ADMIN",
  "PARTNER_OPERATOR",
  "CONTRACTOR_OPERATOR",
  "INTERN_READONLY",
] as const;

// ---------------------------------------------------------------------------
// Protected Routes Configuration
// ---------------------------------------------------------------------------

/**
 * Maps route path patterns to the list of roles that are allowed access.
 * Routes are matched by prefix — e.g. "/api/audit" matches "/api/audit/123".
 * Order matters: more specific routes should come first.
 */
export const PROTECTED_ROUTES: Record<string, Role[]> = {
  // Admin-only routes
  "/api/admin": ["SYSTEM_ADMIN"],
  "/admin": ["SYSTEM_ADMIN"],

  // Audit routes
  "/api/audit": ["SYSTEM_ADMIN", "OPERATIONS_LEAD", "AUDITOR", "LEGAL_APPROVER", "VP_APPROVER"],
  "/auditoria": ["SYSTEM_ADMIN", "OPERATIONS_LEAD", "AUDITOR", "LEGAL_APPROVER", "VP_APPROVER"],

  // Approvals routes
  "/api/approvals": ["SYSTEM_ADMIN", "LEGAL_APPROVER", "VP_APPROVER"],
  "/aprobaciones": ["SYSTEM_ADMIN", "LEGAL_APPROVER", "VP_APPROVER"],

  // Annulations / cancellations routes
  "/api/annulations": [
    "SYSTEM_ADMIN",
    "OPERATIONS_LEAD",
    "ANALYST",
    "LEGAL_APPROVER",
    "VP_APPROVER",
    "BUSINESS_OWNER",
    "AUDITOR",
    "PARTNER_OPERATOR",
  ],
  "/anulaciones": [
    "SYSTEM_ADMIN",
    "OPERATIONS_LEAD",
    "ANALYST",
    "LEGAL_APPROVER",
    "VP_APPROVER",
    "BUSINESS_OWNER",
    "AUDITOR",
    "PARTNER_OPERATOR",
  ],

  // Capacity routes
  "/api/capacity": ["SYSTEM_ADMIN", "OPERATIONS_LEAD", "BUSINESS_OWNER"],
  "/capacidad": ["SYSTEM_ADMIN", "OPERATIONS_LEAD", "BUSINESS_OWNER"],

  // Evidence routes
  "/api/evidence": ["SYSTEM_ADMIN", "OPERATIONS_LEAD", "AUDITOR"],
  "/evidencia": ["SYSTEM_ADMIN", "OPERATIONS_LEAD", "AUDITOR"],

  // Migration routes
  "/api/migration": ["SYSTEM_ADMIN"],

  // User management routes
  "/api/users": ["SYSTEM_ADMIN", "PARTNER_ADMIN"],

  // Email management
  "/api/email": ["SYSTEM_ADMIN"],
};

// ---------------------------------------------------------------------------
// JWT Helpers
// ---------------------------------------------------------------------------

const TOKEN_COOKIE_NAMES = ["session-token", "next-auth.session-token"];

/**
 * Extracts the JWT secret from environment variable.
 * Returns the secret encoded as Uint8Array for jose.
 */
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "";
  return new TextEncoder().encode(secret);
}

/**
 * Extracts JWT token from request cookies.
 * Looks for 'session-token' or 'next-auth.session-token'.
 */
export function extractToken(request: NextRequest): string | null {
  for (const name of TOKEN_COOKIE_NAMES) {
    const cookie = request.cookies.get(name);
    if (cookie?.value) {
      return cookie.value;
    }
  }
  return null;
}

/**
 * Verifies and decodes a JWT token, extracting the role claim.
 * Returns the role string if valid, null otherwise.
 * Validation is purely local (no DB query).
 */
export async function verifyTokenAndGetRole(token: string): Promise<Role | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);

    const role = payload.role as string | undefined;
    if (!role || !VALID_ROLES.includes(role as Role)) {
      return null;
    }

    return role as Role;
  } catch {
    // Token expired, invalid signature, malformed, etc.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route Matching
// ---------------------------------------------------------------------------

/**
 * Finds the allowed roles for a given pathname by matching against PROTECTED_ROUTES.
 * Returns the allowed roles array if the route is protected, or null if not protected.
 */
export function findAllowedRoles(pathname: string): Role[] | null {
  for (const [pattern, roles] of Object.entries(PROTECTED_ROUTES)) {
    if (pathname === pattern || pathname.startsWith(pattern + "/")) {
      return roles;
    }
  }
  return null;
}

/**
 * Determines if a pathname is an API route.
 */
export function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

// ---------------------------------------------------------------------------
// Response Builders
// ---------------------------------------------------------------------------

function forbiddenApiResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to access this resource. Contact your SYSTEM_ADMIN for role assignment.",
      },
    },
    { status: 403 }
  );
}

function unauthorizedApiResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required. Please provide a valid session token.",
      },
    },
    { status: 401 }
  );
}

function forbiddenPageRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/access-denied";
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

function loginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Check if this route is protected
  const allowedRoles = findAllowedRoles(pathname);

  // If the route is not in the protected list, allow it through
  if (allowedRoles === null) {
    return NextResponse.next();
  }

  // Extract JWT token from cookies
  const token = extractToken(request);

  // No token → unauthenticated
  if (!token) {
    if (isApiRoute(pathname)) {
      return unauthorizedApiResponse();
    }
    return loginRedirect(request);
  }

  // Verify token and extract role
  const role = await verifyTokenAndGetRole(token);

  // Invalid token or no role in token → unauthenticated/forbidden
  if (!role) {
    if (isApiRoute(pathname)) {
      return forbiddenApiResponse();
    }
    return forbiddenPageRedirect(request);
  }

  // Check if user's role is in the allowed list
  if (!allowedRoles.includes(role)) {
    if (isApiRoute(pathname)) {
      return forbiddenApiResponse();
    }
    return forbiddenPageRedirect(request);
  }

  // Authorized — proceed
  return NextResponse.next();
}

// ---------------------------------------------------------------------------
// Matcher Configuration
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    // Match all API routes except public ones
    "/api/admin/:path*",
    "/api/audit/:path*",
    "/api/approvals/:path*",
    "/api/annulations/:path*",
    "/api/capacity/:path*",
    "/api/evidence/:path*",
    "/api/migration/:path*",
    "/api/users/:path*",
    "/api/email/:path*",
    // Match protected page routes
    "/admin/:path*",
    "/auditoria/:path*",
    "/aprobaciones/:path*",
    "/anulaciones/:path*",
    "/capacidad/:path*",
    "/evidencia/:path*",
  ],
};
