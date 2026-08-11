/**
 * Partner Email Validator
 * 
 * Validates that a sender email matches the active authorized email
 * for a specific partner. Used in the annulation flow.
 * 
 * Requirements: REQ-12.1, REQ-16.2
 */

import { query } from "@/lib/server/database";

export interface PartnerEmailValidationResult {
  authorized: boolean;
  partnerId?: string;
  partnerName?: string;
  reason?: string;
}

/**
 * Validates that the given email is the active authorized email for the partner.
 * 
 * Rules:
 * - The email must match EXACTLY (case-insensitive) the active authorized email
 * - Being in a global whitelist or having a @vanti.com.co domain is NOT sufficient
 * - The partner must exist and be active
 */
export async function validatePartnerEmail(
  partnerId: string,
  senderEmail: string
): Promise<PartnerEmailValidationResult> {
  if (!partnerId || !senderEmail) {
    return { authorized: false, reason: "partner_id and sender_email are required" };
  }

  const normalizedEmail = senderEmail.trim().toLowerCase();

  try {
    // Check partner exists and is active
    const partnerRows = await query<{ id: string; name: string; status: string }>(
      "SELECT id, name, status FROM partners WHERE id = $1",
      [partnerId]
    );

    if (!partnerRows.length) {
      return { authorized: false, reason: "partner_not_found" };
    }

    const partner = partnerRows[0];
    if (partner.status !== "active") {
      return { authorized: false, partnerId: partner.id, partnerName: partner.name, reason: "partner_inactive" };
    }

    // Get the single active authorized email for this partner
    const emailRows = await query<{ email: string }>(
      "SELECT email FROM partner_authorized_emails WHERE partner_id = $1 AND is_active = true LIMIT 1",
      [partnerId]
    );

    if (!emailRows.length) {
      return { authorized: false, partnerId: partner.id, partnerName: partner.name, reason: "no_active_email_configured" };
    }

    const authorizedEmail = emailRows[0].email.trim().toLowerCase();

    // Exact comparison (case-insensitive)
    if (normalizedEmail !== authorizedEmail) {
      return {
        authorized: false,
        partnerId: partner.id,
        partnerName: partner.name,
        reason: "email_mismatch",
      };
    }

    return {
      authorized: true,
      partnerId: partner.id,
      partnerName: partner.name,
    };
  } catch (error) {
    console.error("Partner email validation error:", error);
    return { authorized: false, reason: "internal_error" };
  }
}

/**
 * Logs a denied partner email validation to audit_events.
 */
export async function logPartnerEmailDenied(
  partnerId: string,
  attemptedEmail: string,
  reason: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
       VALUES ($1, 'PARTNER_EMAIL_VALIDATION', '/api/annulations', $2, 'denied', $3)`,
      [
        attemptedEmail,
        partnerId,
        JSON.stringify({
          attemptedEmail,
          partnerId,
          reason,
          timestamp: new Date().toISOString(),
        }),
      ]
    );
  } catch (error) {
    console.error("Failed to log partner email denial:", error);
  }
}
