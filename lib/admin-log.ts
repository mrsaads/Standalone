import { getDb } from "@/db";
import { adminAuditLog } from "@/db/schema";

// Every admin action that changes data (plan/payment entry, optimization-request status) writes one
// row here. This is the "record an admin audit log" requirement from the original brief — an
// elevated action must always be attributable to a specific admin, never a bare unauditable write.
// `detail` is a short human-readable summary only — never a secret value, never a password/token.
export async function logAdminAction(adminEmail: string, action: string, targetType: string, targetId: string, detail = "") {
  try {
    await getDb().insert(adminAuditLog).values({ adminEmail, action, targetType, targetId, detail });
  } catch (error) {
    // Best-effort: a logging failure must never block the admin action itself from completing.
    console.error("Admin audit log write failed", error instanceof Error ? error.name : "UnknownError");
  }
}
