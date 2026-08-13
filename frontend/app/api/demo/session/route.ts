import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { query } from "@/lib/server/database";

export const dynamic = "force-dynamic";

/**
 * Assessment Demo Session API
 *
 * POST /api/demo/session
 *
 * Issues a valid JWT session token for pre-defined demo personas.
 * This is NOT a bypass — it creates a real authenticated session using
 * the same JWT_SECRET as the middleware verifies.
 *
 * Only available when ASSESSMENT_DEMO_MODE=true.
 * Demo users must exist in the database (seeded via migration).
 *
 * Body: { personaId: string }
 * Response: Sets HttpOnly session-token cookie + returns user info
 *
 * DELETE /api/demo/session — Clears the session cookie
 */

const DEMO_PERSONAS: Record<string, { email: string; role: string; displayName: string }> = {
  partner_user: {
    email: "partner.demo01@example.com",
    role: "BUSINESS_OWNER",
    displayName: "Partner Demo Autorizado",
  },
  intern_analyst: {
    email: "analyst.demo@vantiops-assessment.com",
    role: "ANALYST",
    displayName: "Analista Demo",
  },
  intern_coordinator: {
    email: "coordinator.demo@vantiops-assessment.com",
    role: "ASSESSMENT_COORDINATOR",
    displayName: "Coordinador Demo",
  },
  intern_readonly: {
    email: "readonly.demo@vantiops-assessment.com",
    role: "INTERN_READONLY",
    displayName: "Usuario Solo Lectura",
  },
};

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "";
  return new TextEncoder().encode(secret);
}

function isDemoMode(): boolean {
  return process.env.ASSESSMENT_DEMO_MODE === "true";
}

export async function POST(request: NextRequest) {
  if (!isDemoMode()) {
    return NextResponse.json(
      { error: { code: "DEMO_MODE_DISABLED", message: "Assessment demo mode is not active." } },
      { status: 403 }
    );
  }

  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!secret) {
    return NextResponse.json(
      { error: { code: "CONFIGURATION_ERROR", message: "JWT secret not configured." } },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const personaId = body.personaId as string | undefined;
  if (!personaId || !DEMO_PERSONAS[personaId]) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PERSONA",
          message: `Invalid persona. Available: ${Object.keys(DEMO_PERSONAS).join(", ")}`,
        },
      },
      { status: 400 }
    );
  }

  const persona = DEMO_PERSONAS[personaId];

  // Ensure demo user exists in DB (upsert)
  try {
    await query(
      `INSERT INTO app_users (email, display_name, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (email) DO UPDATE SET display_name = $2, is_active = true`,
      [persona.email, persona.displayName]
    );
  } catch (err) {
    console.error("Failed to upsert demo user:", err);
    // Non-critical — continue with token issuance
  }

  // Sign JWT with the same secret as middleware
  const jwtSecret = getJwtSecret();
  const token = await new SignJWT({
    role: persona.role,
    email: persona.email,
    sub: persona.email,
    displayName: persona.displayName,
    demoPersona: personaId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(jwtSecret);

  // Set HttpOnly cookie
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const response = NextResponse.json({
    data: {
      personaId,
      displayName: persona.displayName,
      role: persona.role,
      email: persona.email,
    },
    message: "Demo session created successfully",
  });

  response.cookies.set("session-token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60, // 8 hours
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ message: "Session cleared" });
  response.cookies.set("session-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
