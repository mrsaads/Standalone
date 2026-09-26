import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { logAdminAction } from "@/lib/admin-log";
import {
  AdminClientError,
  addWorkspaceProfile,
  createReport,
  grantMember,
  revokeMember,
  setWorkspaceProfileStatus,
  updateWorkspace,
} from "@/lib/admin-clients";
import { isUuid } from "@/lib/workspace-access";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

// Everything that acts on one managed client, dispatched on `action` so the admin check, the origin
// check and the audit log all live in one place rather than being re-implemented per verb.
//
// Every action is scoped to the workspace id in the URL: a member id or profile id that belongs to a
// different client matches nothing and comes back 404, so one client's records can never be moved or
// revoked through another client's endpoint.
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    name: z.string().trim().min(2).max(120).optional(),
    status: z.enum(["active", "suspended"]).optional(),
    serviceStartDate: isoDate.or(z.literal("")).optional(),
    objectives: z.string().trim().max(2000).optional(),
    accountManager: z.string().trim().max(120).optional(),
  }).strict(),
  z.object({ action: z.literal("grant_member"), email: z.string().trim().email().max(254) }).strict(),
  z.object({ action: z.literal("revoke_member"), memberId: z.string() }).strict(),
  z.object({
    action: z.literal("add_profile"),
    name: z.string().trim().min(1).max(120),
    upworkUrl: z.string().trim().max(500).optional().default(""),
  }).strict(),
  z.object({
    action: z.literal("set_profile_status"),
    profileId: z.string(),
    status: z.enum(["active", "archived"]),
  }).strict(),
  z.object({
    action: z.literal("create_report"),
    workspaceProfileId: z.string(),
    periodStart: isoDate,
    periodEnd: isoDate,
    title: z.string().trim().max(160).optional().default(""),
    overview: z.string().trim().max(4000).optional().default(""),
    goals: z.string().trim().max(4000).optional().default(""),
    workCompleted: z.string().trim().max(6000).optional().default(""),
    nextActions: z.string().trim().max(4000).optional().default(""),
    clientActions: z.string().trim().max(4000).optional().default(""),
  }).strict(),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  const { id } = await params;
  if (!isUuid(id)) return json({ error: "Client not found." }, 404);

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Check the details you entered." }, 400);
  const data = parsed.data;

  try {
    switch (data.action) {
      case "update": {
        const patch: Record<string, unknown> = {};
        if (data.name !== undefined) patch.name = data.name;
        if (data.status !== undefined) patch.status = data.status;
        if (data.serviceStartDate !== undefined) patch.serviceStartDate = data.serviceStartDate || null;
        if (data.objectives !== undefined) patch.objectives = data.objectives;
        if (data.accountManager !== undefined) patch.accountManager = data.accountManager;
        if (Object.keys(patch).length === 0) return json({ error: "Nothing to change." }, 400);
        const existing = await updateWorkspace(id, patch);
        await logAdminAction(user.email, "workspace_updated", "client_workspace", id, `${existing.name}: ${Object.keys(patch).join(", ")}${data.status ? ` -> ${data.status}` : ""}`);
        return json({ ok: true }, 200);
      }

      case "grant_member": {
        const result = await grantMember(id, data.email, user.email);
        await logAdminAction(user.email, "workspace_access_granted", "client_workspace", id, `${result.userEmail} -> ${result.workspaceName}`);
        return json({ ok: true, userEmail: result.userEmail }, 201);
      }

      case "revoke_member": {
        if (!isUuid(data.memberId)) return json({ error: "That member is not on this client." }, 404);
        const result = await revokeMember(id, data.memberId);
        await logAdminAction(user.email, "workspace_access_revoked", "client_workspace", id, result.userEmail);
        return json({ ok: true, userEmail: result.userEmail }, 200);
      }

      case "add_profile": {
        const created = await addWorkspaceProfile(id, { name: data.name, upworkUrl: data.upworkUrl });
        await logAdminAction(user.email, "workspace_profile_added", "workspace_profile", created.id, data.name);
        return json({ ok: true, id: created.id }, 201);
      }

      case "set_profile_status": {
        if (!isUuid(data.profileId)) return json({ error: "That profile is not on this client." }, 404);
        const row = await setWorkspaceProfileStatus(id, data.profileId, data.status);
        await logAdminAction(user.email, "workspace_profile_status", "workspace_profile", data.profileId, `${row.name} -> ${data.status}`);
        return json({ ok: true }, 200);
      }

      case "create_report": {
        if (!isUuid(data.workspaceProfileId)) return json({ error: "That profile is not on this client." }, 404);
        const created = await createReport(id, { ...data, createdByEmail: user.email });
        await logAdminAction(user.email, "weekly_report_created", "weekly_report", created.id, `${data.periodStart}..${data.periodEnd}`);
        // Created as a draft. Nobody is notified and no client can see it until it is published.
        return json({ ok: true, id: created.id }, 201);
      }
    }
  } catch (cause) {
    if (cause instanceof AdminClientError) return json({ error: cause.message }, cause.status);
    throw cause;
  }
}
