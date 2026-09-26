import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { logAdminAction } from "@/lib/admin-log";
import { AdminClientError, createWorkspace, listWorkspacesForAdmin } from "@/lib/admin-clients";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });

// Managed clients ("client workspaces"). Admin-only, both verbs.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  return json({ workspaces: await listWorkspacesForAdmin() }, 200);
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  // ISO date, or empty. Stored as a real `date` column, so a malformed value is refused here rather
  // than reaching Postgres as a cast error.
  serviceStartDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
  objectives: z.string().trim().max(2000).optional().default(""),
  accountManager: z.string().trim().max(120).optional().default(""),
}).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Enter a client name (and a valid start date, if you set one)." }, 400);

  try {
    const created = await createWorkspace({
      name: parsed.data.name,
      serviceStartDate: parsed.data.serviceStartDate || null,
      objectives: parsed.data.objectives,
      accountManager: parsed.data.accountManager,
      createdByEmail: user.email,
    });
    await logAdminAction(user.email, "workspace_created", "client_workspace", created.id, `${parsed.data.name} (${created.slug})`);
    // Creating a client grants nobody anything. Access is a separate, deliberate step.
    return json({ ok: true, id: created.id, slug: created.slug }, 201);
  } catch (cause) {
    if (cause instanceof AdminClientError) return json({ error: cause.message }, cause.status);
    throw cause;
  }
}
