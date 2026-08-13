import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/server/database";
import { getRequestIdentity } from "@/lib/server/auth-context";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo/reset
 *
 * Resets demo data using STRUCTURAL identification (data_classification + demo_batch_id).
 * NEVER uses radicado patterns (LIKE 'ANU-%') as a security boundary.
 * Atomic: all-or-nothing within a transaction.
 * Only affects: data_classification='SIMULATED_DATA' AND demo_batch_id='assessment-demo'
 */

const SEED_CANCELLATIONS = [
  { radicado: "ANU-DEMO-0001", pqrId: "PQR-DEMO-001", state: "Solicitada", justification: "Solicitud de cancelación servicio duplicado en el sistema", historySteps: [] },
  { radicado: "ANU-DEMO-0002", pqrId: "PQR-DEMO-002", state: "En_Revision", justification: "Revisión pendiente de documentación soporte", historySteps: [{ from: "Solicitada", to: "En_Revision", role: "ANALYST", reason: "Documentación recibida, iniciando revisión" }] },
  { radicado: "ANU-DEMO-0003", pqrId: "PQR-DEMO-003", state: "Aprobada", justification: "Aprobación por cumplimiento de requisitos legales", historySteps: [{ from: "Solicitada", to: "En_Revision", role: "ANALYST", reason: "Solicitud clasificada para revisión legal" }, { from: "En_Revision", to: "Aprobada", role: "ASSESSMENT_COORDINATOR", reason: "Requisitos legales verificados correctamente" }] },
  { radicado: "ANU-DEMO-0004", pqrId: "PQR-DEMO-004", state: "En_Ejecucion", justification: "Ejecución de anulación en proceso operativo", historySteps: [{ from: "Solicitada", to: "En_Revision", role: "ANALYST", reason: "Documentación completa para revisión" }, { from: "En_Revision", to: "Aprobada", role: "ASSESSMENT_COORDINATOR", reason: "Aprobada por coordinación operativa" }, { from: "Aprobada", to: "En_Ejecucion", role: "ASSESSMENT_COORDINATOR", reason: "Inicio de ejecución del proceso" }] },
  { radicado: "ANU-DEMO-0005", pqrId: "PQR-DEMO-005", state: "Rechazada", justification: "Rechazada por falta de soporte documental válido", historySteps: [{ from: "Solicitada", to: "En_Revision", role: "ANALYST", reason: "Revisión de documentación iniciada" }, { from: "En_Revision", to: "Rechazada", role: "ASSESSMENT_COORDINATOR", reason: "Soporte documental insuficiente para aprobación" }] },
  { radicado: "ANU-DEMO-0006", pqrId: "PQR-DEMO-006", state: "Cerrada", justification: "Proceso completado satisfactoriamente sin observaciones", historySteps: [{ from: "Solicitada", to: "En_Revision", role: "ANALYST", reason: "Documentación verificada por analista" }, { from: "En_Revision", to: "Aprobada", role: "ASSESSMENT_COORDINATOR", reason: "Solicitud cumple criterios de anulación" }, { from: "Aprobada", to: "En_Ejecucion", role: "ASSESSMENT_COORDINATOR", reason: "Proceso de anulación autorizado" }, { from: "En_Ejecucion", to: "Cerrada", role: "ASSESSMENT_COORDINATOR", reason: "Anulación ejecutada y verificada correctamente" }] },
];

export async function POST(request: NextRequest) {
  if (process.env.ASSESSMENT_DEMO_MODE !== "true") {
    return NextResponse.json(
      { error: { code: "DEMO_MODE_DISABLED", message: "Assessment demo mode is not active." } },
      { status: 403 }
    );
  }

  const identity = await getRequestIdentity(request);
  if (identity.role !== "SYSTEM_ADMIN" && identity.role !== "ASSESSMENT_COORDINATOR") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only coordinators can reset demo data." } },
      { status: 403 }
    );
  }

  try {
    const result = await withTransaction(async (client) => {
      // 1. Delete history for assessment-demo cancellations ONLY
      await client.query(
        `DELETE FROM cancellation_state_history WHERE cancellation_id IN (
          SELECT id FROM cancellation_requests
          WHERE data_classification = 'SIMULATED_DATA' AND demo_batch_id = 'assessment-demo'
        )`
      );

      // 2. Delete assessment-demo cancellations ONLY
      await client.query(
        `DELETE FROM cancellation_requests
         WHERE data_classification = 'SIMULATED_DATA' AND demo_batch_id = 'assessment-demo'`
      );

      // 3. Ensure demo user exists
      await client.query(
        `INSERT INTO app_users (email, display_name, is_active)
         VALUES ('partner.demo01@example.com', 'Partner Demo Autorizado', true)
         ON CONFLICT (email) DO UPDATE SET is_active = true`
      );
      await client.query(
        `INSERT INTO app_users (email, display_name, is_active)
         VALUES ('analyst.demo@vantiops-assessment.com', 'Analista Demo', true)
         ON CONFLICT (email) DO UPDATE SET is_active = true`
      );
      await client.query(
        `INSERT INTO app_users (email, display_name, is_active)
         VALUES ('coordinator.demo@vantiops-assessment.com', 'Coordinador Demo', true)
         ON CONFLICT (email) DO UPDATE SET is_active = true`
      );

      // 4. Ensure demo partner
      await client.query(
        `INSERT INTO partners (name, tax_id, contact_email, status)
         VALUES ('Aliado Demo Bogotá', '999.000.001-1', 'partner.demo01@example.com', 'active')
         ON CONFLICT (tax_id) DO UPDATE SET status = 'active', name = 'Aliado Demo Bogotá'`
      );

      const partnerRows = await client.query(`SELECT id FROM partners WHERE tax_id = '999.000.001-1'`);
      const partnerId = partnerRows.rows[0]?.id;

      if (partnerId) {
        // Ensure single active email
        await client.query(`UPDATE partner_authorized_emails SET is_active = false WHERE partner_id = $1`, [partnerId]);
        const presenterEmail = process.env.DEMO_PRESENTER_EMAIL;
        const activeEmail = presenterEmail ? presenterEmail.toLowerCase() : "partner.demo01@example.com";
        await client.query(
          `INSERT INTO partner_authorized_emails (partner_id, email, is_active)
           VALUES ($1, $2, true)
           ON CONFLICT (partner_id, email) DO UPDATE SET is_active = true`,
          [partnerId, activeEmail]
        );
      }

      // 5. Get requester user ID
      const userRows = await client.query(`SELECT id FROM app_users WHERE email = 'partner.demo01@example.com'`);
      const requesterId = userRows.rows[0]?.id;
      const analystRows = await client.query(`SELECT id FROM app_users WHERE email = 'analyst.demo@vantiops-assessment.com'`);
      const analystId = analystRows.rows[0]?.id;
      const coordRows = await client.query(`SELECT id FROM app_users WHERE email = 'coordinator.demo@vantiops-assessment.com'`);
      const coordId = coordRows.rows[0]?.id;

      if (!requesterId || !partnerId) {
        throw new Error("Required demo users/partner not found after upsert");
      }

      // 6. Insert seed cancellations with proper classification
      const baseTime = new Date();
      for (let i = 0; i < SEED_CANCELLATIONS.length; i++) {
        const seed = SEED_CANCELLATIONS[i];
        const version = 1 + seed.historySteps.length;
        const createdAt = new Date(baseTime.getTime() - (SEED_CANCELLATIONS.length - i) * 3600000);

        const insertResult = await client.query(
          `INSERT INTO cancellation_requests
           (radicado, pqr_id, current_state, requested_by, justification,
            data_classification, demo_batch_id, version, partner_id, sender_email, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'SIMULATED_DATA', 'assessment-demo', $6, $7, 'partner.demo01@example.com', $8, $8)
           RETURNING id`,
          [seed.radicado, seed.pqrId, seed.state, requesterId, seed.justification, version, partnerId, createdAt.toISOString()]
        );
        const cancellationId = insertResult.rows[0].id;

        // Insert coherent history
        for (let j = 0; j < seed.historySteps.length; j++) {
          const step = seed.historySteps[j];
          const stepTime = new Date(createdAt.getTime() + (j + 1) * 60000); // 1 min apart
          const actorId = step.role === "ANALYST" ? analystId : coordId;
          await client.query(
            `INSERT INTO cancellation_state_history
             (cancellation_id, from_state, to_state, transitioned_by, transitioned_by_role, justification, transitioned_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [cancellationId, step.from, step.to, actorId || requesterId, step.role, step.reason, stepTime.toISOString()]
          );
        }
      }

      // 7. Audit event
      await client.query(
        `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
         VALUES ($1, 'DEMO_DATA_RESET', '/api/demo/reset', 'assessment-demo', 'success', $2)`,
        [identity.userId || identity.email || "demo-coordinator",
         JSON.stringify({ resetAt: new Date().toISOString(), seedCount: SEED_CANCELLATIONS.length })]
      );

      return { cancellationsSeeded: SEED_CANCELLATIONS.length, partnerId };
    });

    return NextResponse.json({ message: "Demo data reset successfully", data: result });
  } catch (error) {
    console.error("Error resetting demo data:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to reset demo data" } },
      { status: 500 }
    );
  }
}
