import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export const dynamic = "force-dynamic";

/**
 * GET /api/demo/session/status
 *
 * Returns current session information (if any).
 * Does NOT require authentication — it reports auth state.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("session-token")?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!secret) {
    return NextResponse.json({ authenticated: false, reason: "no_secret_configured" });
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.json({
      authenticated: true,
      role: payload.role,
      email: payload.email,
      displayName: payload.displayName,
      demoPersona: payload.demoPersona || null,
    });
  } catch {
    return NextResponse.json({ authenticated: false, reason: "invalid_token" });
  }
}
