import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/server/database";
import { getRequestIdentity } from "@/lib/server/auth-context";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo/reset
 *
 * Resets demo data to seed state.
 * Only available when ASSESSMENT_DEMO_MODE=true and user is SYSTEM_ADMIN.
 * NEVER touches REAL_DATA (pqr_records).
 */

const SEED_CANCELLATIONS = [
  { radicado: "ANU-DEMO-0001", pqrId: "PQR-DEMO-001", state: "Solicitada", justification: "Solicitud de cancelación servicio duplicado en el sistema" },
  { radicado: "ANU-DEMO-0002", pqrId: "PQR-DEMO-002", state: "En_Revision", justification: "Revisión pendiente de documentación soporte" },
  { radicado: "ANU-DEMO-0003", pqrId: "PQR-DEMO-003", state: "Aprobada", justification: "Aprobación por cumplimiento de requisitos legales" },
  { radicado: "ANU-DEMO-0004", pqrId: "PQR-DEMO-004", state: "En_Ejecucion", justification: "Ejecución de anulación en proceso operativo" },
  { radicado: "ANU-DEMO-0005", pqrId: "PQR-DEMO-005", state: "Rechazada", justification: "Rechazada por falta de soporte documental válido" },
  { radicado: "ANU-DEMO-0006", pqrId: "PQR-DEMO-006", state: "Cerrada", justification: "Proceso completado satisfactoriamente sin observaciones" },
];

export async function POST(request: NextRequest) {
  if (process.env.ASSESSMENT_DEMO_MODE !== "true") {
    return NextResponse.json(
      { error: { code: "DEMO_MODE_DISABLED", message: "Assessment demo mode is not active." } },
      { status: 403 }
    );
  }

  const identity = await getRequestIdentity(request);
  if (identity.role !== "SYSTEM_ADMIN") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only SYSTEM_ADMIN can reset demo data." } },
      { status: 403 }
    );
  }

  try {
    // Delete existing demo cancellations and their history (only demo data)
    await query(
      `DELETE FROM cancellation_state_history WHERE cancellation_id IN (
        SELECT id FROM cancellation_requests WHERE radicado LIKE 'ANU-DEMO-%' OR radicado LIKE 'ANU-1%'
      )`
    );
    await query(`DELETE FROM cancellation_requests WHERE radicado LIKE 'ANU-DEMO-%' OR radicado LIKE 'ANU-1%'`);

    // Ensure demo partner user exists
    await query(
      `INSERT INTO app_users (email, display_name, is_active)
       VALUES ('partner.demo01@example.com', 'Partner Demo Autorizado', true)
       ON CONFLICT (email) DO UPDATE SET is_active = true`
    );

    // Ensure demo partner exists
    await query(
      `INSERT INTO partners (name, tax_id, contact_email, status)
       VALUES ('Aliado Demo Bogotá', '999.000.001-1', 'partner.demo01@example.com', 'active')
       ON CONFLICT (tax_id) DO UPDATE SET status = 'active', name = 'Aliado Demo Bogotá'
       `
    );

    // Get partner ID
    const partnerRows = await query<{ id: string }>(
      `SELECT id FROM partners WHERE tax_id = '999.000.001-1'`
    );
    const partnerId = partnerRows[0]?.id;

    if (partnerId) {
      // Ensure authorized email
      await query(
        `INSERT INTO partner_authorized_emails (partner_id, email, is_active)
         VALUES ($1, 'partner.demo01@example.com', true)
         ON CONFLICT (partner_id, email) DO UPDATE SET is_active = true`,
        [partnerId]
      );

      // Also add presenter email if configured
      const presenterEmail = process.env.DEMO_PRESENTER_EMAIL;
      if (presenterEmail) {
        // Deactivate other emails for this partner first (single active email rule)
        await query(
          `UPDATE partner_authorized_emails SET is_active = false WHERE partner_id = $1 AND email != $2 AND email != 'partner.demo01@example.com'`,
          [partnerId, presenterEmail.toLowerCase()]
        );
        await query(
          `INSERT INTO partner_authorized_emails (partner_id, email, is_active)
           VALUES ($1, $2, true)
           ON CONFLICT (partner_id, email) DO UPDATE SET is_active = true`,
          [partnerId, presenterEmail.toLowerCase()]
        );
      }
    }

    // Get requester user ID
    const userRows = await query<{ id: string }>(
      `SELECT id FROM app_users WHERE email = 'partner.demo01@example.com'`
    );
    const requesterId = userRows[0]?.id;

    if (requesterId && partnerId) {
      // Re-create seed cancellations
      for (const seed of SEED_CANCELLATIONS) {
        await query(
          `INSERT INTO cancellation_requests (radicado, pqr_id, current_state, requested_by, justification)
           VALUES ($1, $2, $3, $4, $5)`,
          [seed.radicado, seed.pqrId, seed.state, requesterId, seed.justification]
        );
      }
    }

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
       VALUES ($1, 'DEMO_DATA_RESET', '/api/demo/reset', 'assessment-demo', 'success', $2)`,
      [
        identity.userId,
        JSON.stringify({ resetAt: new Date().toISOString(), seedCount: SEED_CANCELLATIONS.length }),
      ]
    );

    return NextResponse.json({
      message: "Demo data reset successfully",
      data: { cancellationsSeeded: SEED_CANCELLATIONS.length, partnerId },
    });
  } catch (error) {
    console.error("Error resetting demo data:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to reset demo data" } },
      { status: 500 }
    );
  }
}
