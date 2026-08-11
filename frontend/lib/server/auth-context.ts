/**
 * Server-side Auth Context
 * 
 * Extracts verified identity from JWT token in route handlers.
 * NEVER trusts x-user-role or x-user-id headers from the client.
 * 
 * The JWT must be verified server-side using the same secret as middleware.
 * This prevents privilege escalation via spoofed headers.
 * 
 * Requirements: REQ-13.3, REQ-13.4, REQ-13.5
 */

import { NextRequest } from "next/server";
import { jwtVerify } from "jose";

export interface AuthIdentity {
  role: string;
  userId: string;
  email?: string;
  verified: boolean;
}

const TOKEN_COOKIE_NAMES = ["session-token", "next-auth.session-token"];

const VALID_ROLES = new Set([
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
]);

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "";
  return new TextEncoder().encode(secret);
}

/**
 * Extracts and verifies the user identity from the JWT token in the request.
 * 
 * This function:
 * 1. Reads the JWT from cookies (same as middleware)
 * 2. Verifies the signature
 * 3. Extracts role and user ID from the token payload
 * 4. IGNORES any x-user-role or x-user-id headers from the client
 * 
 * If verification fails or no token is present, returns { verified: false }
 */
export async function getVerifiedIdentity(request: NextRequest): Promise<AuthIdentity> {
  // Extract token from cookies
  let token: string | undefined;
  for (const name of TOKEN_COOKIE_NAMES) {
    const cookie = request.cookies.get(name);
    if (cookie?.value) {
      token = cookie.value;
      break;
    }
  }

  if (!token) {
    return { role: "", userId: "", verified: false };
  }

  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);

    const role = payload.role as string | undefined;
    const userId = (payload.sub || payload.userId || payload.email || "") as string;
    const email = payload.email as string | undefined;

    if (!role || !VALID_ROLES.has(role)) {
      return { role: "", userId: "", verified: false };
    }

    return {
      role,
      userId,
      email,
      verified: true,
    };
  } catch {
    // Token invalid, expired, wrong signature
    return { role: "", userId: "", verified: false };
  }
}

/**
 * Gets the user role from the request.
 * 
 * Strategy:
 * 1. If JWT_SECRET is configured, verify the JWT and extract role from it (secure)
 * 2. If no JWT_SECRET (development/POC), fall back to x-user-role header
 *    BUT this fallback is clearly documented as insecure and for POC only
 * 
 * In production with JWT_SECRET set, client-spoofed headers are ignored.
 */
export async function getRequestIdentity(request: NextRequest): Promise<AuthIdentity> {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "";
  
  // When JWT secret is configured, ONLY trust the verified token
  if (secret) {
    return getVerifiedIdentity(request);
  }

  // POC fallback: when no JWT_SECRET is set (development mode only)
  // In this mode, headers are accepted but this is NOT secure
  const role = request.headers.get("x-user-role") || "";
  const userId = request.headers.get("x-user-id") || "";
  
  if (!role || !VALID_ROLES.has(role)) {
    return { role: "", userId: "", verified: false };
  }

  return { role, userId, verified: false };
}
