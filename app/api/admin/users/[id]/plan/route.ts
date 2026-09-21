import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { getDb } from "@/db";
import { profiles, paymentRecords } from "@/db/schema";
import { logAdminAction } from "@/lib/admin-log";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });

// Payment history for a user, shown before the admin edits their plan. GET-only, admin-only — no
// route here ever returns anything from auth.users beyond what the caller (app/admin/page.tsx)
// already selects (email/verification/last sign-in), and this endpoint never touches that table.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  const { id } = await params;
  const db = getDb();
  const records = await db.select().from(paymentRecords).where(eq(paymentRecords.userId, id)).orderBy(desc(paymentRecords.createdAt)).limit(50);
  return json({ records: records.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) }, 200);
}

const bodySchema = z.object({
  plan: z.enum(["free", "subscriber"]),
  amount: z.number().min(0).max(10_000_000).default(0),
  currency: z.string().trim().max(10).default(""),
  method: z.string().trim().max(40).default(""),
  reference: z.string().trim().max(200).default(""),
  note: z.string().trim().max(500).default(""),
}).strict();

// Sets a user's plan by hand and records why (method/reference/note the admin was told and typed
// in). This is the entire "subscription management" / "payment details" feature for this build: no
// payment provider is connected, so nothing entered here is validated against a real transaction —
// it is exactly as trustworthy as the admin who typed it, which is why every call is logged to
// admin_audit_log with the admin's own email.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Check the plan details." }, 400);

  const db = getDb();
  const [target] = await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!target) return json({ error: "User not found." }, 404);

  await db.update(profiles).set({ plan: parsed.data.plan, planUpdatedAt: new Date() }).where(eq(profiles.id, id));
  await db.insert(paymentRecords).values({
    userId: id,
    recordedByEmail: user.email,
    plan: parsed.data.plan,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    method: parsed.data.method,
    reference: parsed.data.reference,
    note: parsed.data.note,
  });
  await logAdminAction(
    user.email, "set_plan", "user", id,
    `${target.email} -> ${parsed.data.plan}${parsed.data.amount ? ` (${parsed.data.amount} ${parsed.data.currency || ""} via ${parsed.data.method || "unspecified"})` : ""}`,
  );

  return json({ ok: true, plan: parsed.data.plan }, 200);
}
