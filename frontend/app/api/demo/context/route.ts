import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/server/database";
import { getRequestIdentity } from "@/lib/server/auth-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/demo/context
 *
 * Returns the demo context for the authenticated persona including
 * partner information so the UI doesn't need manual UUIDs.
 */
export async function GET(request: NextRequest) {
  if (process.env.ASSESSMENT_DEMO_MODE !== "true") {
    return NextResponse.json(
      { error: { code: "DEMO_MODE_DISABLED", message: "Assessment demo mode is not active." } },
      { status: 403 }
    );
  }

  const identity = await getRequestIdentity(request);
  if (!identity.role || !identity.verified) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "No session" } }, { status: 401 });
  }

  // For BUSINESS_OWNER (Partner Demo), resolve partner info
  let partner = null;
  if (identity.role === "BUSINESS_OWNER" && identity.email) {
    try {
      const rows = await query<{ id: string; name: string; tax_id: string }>(
        `SELECT p.id, p.name, p.tax_id FROM partners p
         JOIN partner_authorized_emails pae ON pae.partner_id = p.id
         WHERE pae.email = $1 AND pae.is_active = true AND p.status = 'active'
         LIMIT 1`,
        [identity.email.toLowerCase()]
      );
      if (rows.length) {
        partner = { id: rows[0].id, name: rows[0].name, code: rows[0].tax_id, authorizedEmail: identity.email };
      }
    } catch { /* non-critical */ }
  }

  return NextResponse.json({
    persona: {
      role: identity.role,
      email: identity.email,
      displayName: (identity as any).displayName || identity.email,
    },
    partner,
  });
}
