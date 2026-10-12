import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { logAdminAction } from "@/lib/admin-log";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });

const bodySchema = z.object({ role: z.enum(["base", "admin"]) }).strict();

// Grants or revokes admin access for another account. Deliberately gated to the ADMIN_EMAILS
// super-admin specifically — NOT "any admin" (user.role === "admin") — because the whole point of
// this endpoint is the guarantee "no one becomes admin except the super-admin says so." If any
// admin could grant admin, a second admin could promote a third without the super-admin's
// involvement, and that guarantee would already be broken. See lib/auth.ts's isAdminEmail() and its
// doc comment.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    return json({ error: "Only the account configured in ADMIN_EMAILS can grant or revoke admin access." }, 403);
  }
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Check the requested role." }, 400);

  const db = getDb();
  const [target] = await db.select({ id: profiles.id, email: profiles.email, role: profiles.role }).from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!target) return json({ error: "User not found." }, 404);

  // This account is (or would be) admin purely because its email matches ADMIN_EMAILS — that
  // config, not this profiles.role column, is what actually controls its access (see
  // getCurrentUser()), so changing the row here would be a no-op that only misleads whoever reads
  // the admin panel afterward.
  if (isAdminEmail(target.email)) {
    return json({ error: "This account's admin access comes from the ADMIN_EMAILS deployment setting and can't be changed here." }, 400);
  }
  if (target.role === parsed.data.role) return json({ ok: true, role: target.role }, 200);

  await db.update(profiles).set({ role: parsed.data.role }).where(eq(profiles.id, id));
  await logAdminAction(user.email, "set_role", "user", id, `${target.email} -> ${parsed.data.role}`);

  return json({ ok: true, role: parsed.data.role }, 200);
}
