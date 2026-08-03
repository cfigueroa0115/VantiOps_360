/**
 * Email Validation API Endpoint
 *
 * POST /api/auth/validate
 *
 * Validates whether an email is authorized to access VantiOps 360.
 * Authorized emails are those from the corporate domain (@vanti.com.co)
 * or present in the whitelist (data/config/email_whitelist.json).
 *
 * Requirements:
 *   - REQ-17.1: Validate corporate domain or whitelisted emails
 *   - REQ-17.2: Deny unauthorized with 403 + audit event
 *   - REQ-17.3: Whitelist with per-entry expiration
 *   - REQ-17.4: Handle 2,000 emails without degradation
 *   - REQ-22.1: Manage up to 2,000 email addresses
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WhitelistEntry {
  email?: string;
  domain?: string;
  expires_at?: string | null;
}

interface ValidationResponse {
  authorized: boolean;
  reason: string;
}

interface AuditEvent {
  action: string;
  email: string;
  timestamp: string;
  reason: string;
  ip: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORPORATE_DOMAIN = "@vanti.com.co";

// RFC-5322 simplified regex
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// ---------------------------------------------------------------------------
// Whitelist loading (cached in-memory for performance — REQ-17.4)
// ---------------------------------------------------------------------------

let cachedEmails: Map<string, Date | null> = new Map();
let cachedDomains: Map<string, Date | null> = new Map();
let whitelistLoaded = false;

function loadWhitelist(): void {
  cachedEmails = new Map();
  cachedDomains = new Map();

  // Resolve whitelist path relative to project root
  const whitelistPath = join(
    process.cwd(),
    "data",
    "config",
    "email_whitelist.json"
  );

  if (!fs.existsSync(whitelistPath)) {
    whitelistLoaded = true;
    return;
  }

  try {
    const content = fs.readFileSync(whitelistPath, "utf-8");
    const entries: WhitelistEntry[] = JSON.parse(content);

    for (const entry of entries) {
      const expiresAt = entry.expires_at
        ? new Date(entry.expires_at)
        : null;

      if (entry.email) {
        cachedEmails.set(entry.email.trim().toLowerCase(), expiresAt);
      } else if (entry.domain) {
        let domain = entry.domain.trim().toLowerCase();
        if (!domain.startsWith("@")) {
          domain = `@${domain}`;
        }
        cachedDomains.set(domain, expiresAt);
      }
    }
  } catch {
    // If whitelist cannot be parsed, treat as empty
  }

  whitelistLoaded = true;
}

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

function validateEmailFormat(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

function isEmailAuthorized(email: string): { authorized: boolean; reason: string } {
  if (!whitelistLoaded) {
    loadWhitelist();
  }

  const emailLower = email.trim().toLowerCase();

  // Corporate domain is always authorized (REQ-17.1)
  if (emailLower.endsWith(CORPORATE_DOMAIN)) {
    return { authorized: true, reason: "CORPORATE_DOMAIN" };
  }

  const now = new Date();

  // Check exact email in whitelist
  if (cachedEmails.has(emailLower)) {
    const expires = cachedEmails.get(emailLower)!;
    if (expires === null || expires > now) {
      return { authorized: true, reason: "WHITELIST_EMAIL" };
    }
    return { authorized: false, reason: "WHITELIST_ENTRY_EXPIRED" };
  }

  // Check domain in whitelist
  const atIdx = emailLower.lastIndexOf("@");
  if (atIdx >= 0) {
    const domain = emailLower.substring(atIdx);
    if (cachedDomains.has(domain)) {
      const expires = cachedDomains.get(domain)!;
      if (expires === null || expires > now) {
        return { authorized: true, reason: "WHITELIST_DOMAIN" };
      }
      return { authorized: false, reason: "WHITELIST_DOMAIN_EXPIRED" };
    }
  }

  return { authorized: false, reason: "EMAIL_NOT_IN_AUTHORIZED_LIST" };
}

// ---------------------------------------------------------------------------
// Audit event helper (REQ-17.2)
// ---------------------------------------------------------------------------

function createAuditEvent(email: string, reason: string, ip: string): AuditEvent {
  return {
    action: "AUTH_EMAIL_DENIED",
    email,
    timestamp: new Date().toISOString(),
    reason,
    ip,
  };
}

// In-memory audit log for unauthorized attempts (will be replaced by DB in production)
const auditLog: AuditEvent[] = [];

// Exposed via globalThis for test access (Next.js doesn't allow non-handler exports from route files)
if (typeof globalThis !== "undefined") {
  (globalThis as any).__emailValidateAuditLog = auditLog;
  (globalThis as any).__emailValidateResetCache = () => {
    cachedEmails = new Map();
    cachedDomains = new Map();
    whitelistLoaded = false;
  };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse<ValidationResponse>> {
  let body: { email?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { authorized: false, reason: "INVALID_REQUEST_BODY" },
      { status: 400 }
    );
  }

  const { email } = body;

  // Validate presence
  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { authorized: false, reason: "MISSING_EMAIL" },
      { status: 400 }
    );
  }

  // Validate format (REQ-17.1)
  if (!validateEmailFormat(email)) {
    return NextResponse.json(
      { authorized: false, reason: "INVALID_EMAIL_FORMAT" },
      { status: 400 }
    );
  }

  // Authorize
  const result = isEmailAuthorized(email);

  if (result.authorized) {
    return NextResponse.json(
      { authorized: true, reason: result.reason },
      { status: 200 }
    );
  }

  // Unauthorized — create audit event (REQ-17.2)
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const auditEvent = createAuditEvent(email, result.reason, ip);
  auditLog.push(auditEvent);

  return NextResponse.json(
    { authorized: false, reason: result.reason },
    { status: 403 }
  );
}
