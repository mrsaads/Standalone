import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clientWorkspaces,
  reportAttachments,
  weeklyReports,
  workspaceMembers,
  workspaceProfiles,
} from "@/db/schema";
import type { AppUser } from "./auth";

// ---------------------------------------------------------------------------------------------
// THE SINGLE CHOKEPOINT FOR MANAGED-CLIENT ACCESS (AXIS 3).
//
// Every route that reads or writes anything belonging to a client workspace — the portal, a weekly
// report, a report download, an attachment, a workspace-scoped notification — resolves permission
// through one of the functions in this file and through nothing else. The point of funnelling it is
// that there is exactly one place to audit and exactly one place a mistake can live, instead of an
// `if (user.role === ...)` scattered across twenty route handlers.
//
// Three properties this file is responsible for, each of which has a test in
// scripts/local-tests/workspace-isolation.local-test.mts:
//
//   1. Client A cannot reach Client B's anything. Access is decided by an ACTIVE membership row for
//      that exact (workspace, user) pair. Holding a report id, an attachment id, or a workspace id
//      grants nothing on its own — ids are treated as untrusted input, always.
//
//   2. Removing an assignment removes access immediately. Nothing is cached, and `status` is read
//      on every request, so revoking a membership (or suspending the workspace) takes effect on the
//      caller's very next request rather than at their next sign-in.
//
//   3. Audit entitlement and managed-client membership never grant each other's permissions. This
//      file never reads `profiles.audit_entitlement`, `profiles.plan`, or anything from
//      lib/entitlements.ts — so a subscriber gets no portal access here, and, symmetrically,
//      lib/entitlements.ts never reads a membership, so a managed client gets no audit download
//      from being a client. Keeping the two modules ignorant of each other is the mechanism; it is
//      not merely a convention.
//
// A CLIENT NEVER PAYS FOR THIS. There is no entitlement check, no subscription check and no
// checkout anywhere in this file, including on the report-download path. That is deliberate and is
// the "never require payment to view their assigned management reports" requirement.
// ---------------------------------------------------------------------------------------------

export type AccessDenialReason =
  | "not_found"
  | "not_a_member"
  | "membership_revoked"
  | "workspace_suspended";

export class WorkspaceAccessError extends Error {
  readonly reason: AccessDenialReason;
  constructor(reason: AccessDenialReason) {
    super(`Workspace access denied: ${reason}`);
    this.name = "WorkspaceAccessError";
    this.reason = reason;
  }
}

// Deliberately uniform for the caller: every denial becomes the same 404 over the wire (see
// `accessErrorResponse` below), so an attacker cannot tell "this workspace exists but is not yours"
// apart from "no such workspace" by reading status codes or messages. The specific reason stays
// available server-side for logging and for the admin panel.
export type WorkspaceAccess = {
  workspace: typeof clientWorkspaces.$inferSelect;
  // How this caller got in. "member" is a real client. "admin" is a staff account looking at a
  // client's workspace from the admin side — always distinguishable, so the portal can label it and
  // so an admin's read is never mistaken for the client's own.
  via: "member" | "admin";
};

type AccessOptions = {
  // Whether an admin account may pass without a membership row. Defaults to FALSE: an admin is not
  // a client, and the client portal's own routes leave this off so that what an admin sees there is
  // exactly what a client would see. Admin-side routes opt in explicitly.
  allowAdmin?: boolean;
};

// Resolve access to one workspace. Returns null rather than throwing, for call sites that want to
// branch (the dashboard deciding which card to render) rather than fail.
export async function resolveWorkspaceAccess(
  user: Pick<AppUser, "id" | "role">,
  workspaceId: string,
  opts: AccessOptions = {},
): Promise<WorkspaceAccess | { denied: AccessDenialReason }> {
  // Reject anything that is not a uuid before it reaches the database: a malformed id would
  // otherwise raise a Postgres cast error, and a 500 is itself an information leak (it tells the
  // caller their input reached the query layer).
  if (!isUuid(workspaceId)) return { denied: "not_found" };

  const db = getDb();
  const [workspace] = await db
    .select()
    .from(clientWorkspaces)
    .where(eq(clientWorkspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return { denied: "not_found" };

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
    .limit(1);

  if (membership && membership.status === "active") {
    // A suspended workspace withdraws access from its members even though the membership row is
    // still active — checked here, on every request, which is what makes a suspension immediate.
    if (workspace.status !== "active") return { denied: "workspace_suspended" };
    return { workspace, via: "member" };
  }

  // Admin fallback, only where the call site asked for it. Note the ordering: a real membership is
  // always preferred, so an admin who is genuinely also a client of their own product is treated as
  // the client they are.
  if (opts.allowAdmin && user.role === "admin") return { workspace, via: "admin" };

  if (membership) return { denied: "membership_revoked" };
  return { denied: "not_a_member" };
}

export async function requireWorkspaceAccess(
  user: Pick<AppUser, "id" | "role">,
  workspaceId: string,
  opts: AccessOptions = {},
): Promise<WorkspaceAccess> {
  const result = await resolveWorkspaceAccess(user, workspaceId, opts);
  if ("denied" in result) throw new WorkspaceAccessError(result.denied);
  return result;
}

// Every workspace this user is currently an active member of, excluding suspended workspaces.
// This is what the welcome dashboard uses to decide between "Open client portal" and the
// "Request management services" enquiry action — and it is a real query every time, so a
// membership granted or revoked a second ago is reflected on the next page load.
export async function listActiveWorkspaces(userId: string) {
  const db = getDb();
  return db
    .select({
      id: clientWorkspaces.id,
      name: clientWorkspaces.name,
      slug: clientWorkspaces.slug,
      status: clientWorkspaces.status,
      serviceStartDate: clientWorkspaces.serviceStartDate,
      objectives: clientWorkspaces.objectives,
      accountManager: clientWorkspaces.accountManager,
    })
    .from(workspaceMembers)
    .innerJoin(clientWorkspaces, eq(clientWorkspaces.id, workspaceMembers.workspaceId))
    .where(and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.status, "active"),
      eq(clientWorkspaces.status, "active"),
    ))
    .orderBy(asc(clientWorkspaces.name));
}

// The managed profiles inside a workspace the caller has already been authorized for. Takes the
// resolved access object rather than a bare id so it cannot be called without an authorization
// having happened first — the type system carries the proof.
export async function listWorkspaceProfiles(access: WorkspaceAccess) {
  const db = getDb();
  return db
    .select()
    .from(workspaceProfiles)
    .where(and(
      eq(workspaceProfiles.workspaceId, access.workspace.id),
      eq(workspaceProfiles.status, "active"),
    ))
    .orderBy(asc(workspaceProfiles.sortOrder), asc(workspaceProfiles.name));
}

// Reports for one profile, scoped to the authorized workspace.
//
// The `status = 'published'` filter is applied in SQL for anyone who is not staff, so a draft is
// not merely hidden by the UI — it is never selected for a client in the first place. The
// workspace filter is applied alongside it (rather than trusting that profileId belongs to this
// workspace) so a profile id belonging to another client returns nothing instead of leaking.
export async function listReportsForProfile(
  access: WorkspaceAccess,
  workspaceProfileId: string,
  opts: { includeDrafts?: boolean } = {},
) {
  if (!isUuid(workspaceProfileId)) return [];
  const includeDrafts = opts.includeDrafts === true && access.via === "admin";
  const db = getDb();
  const conditions = [
    eq(weeklyReports.workspaceId, access.workspace.id),
    eq(weeklyReports.workspaceProfileId, workspaceProfileId),
  ];
  if (!includeDrafts) conditions.push(eq(weeklyReports.status, "published"));
  return db
    .select()
    .from(weeklyReports)
    .where(and(...conditions))
    .orderBy(desc(weeklyReports.periodEnd));
}

// Authorize one report by its id. This is the function the report page, the download endpoint and
// the attachment endpoint all call. It resolves the report's OWN workspace from the database and
// then authorizes that — it never accepts a workspace id from the caller, which is what stops a
// caller pairing their own workspace id with someone else's report id.
export async function requireReportAccess(
  user: Pick<AppUser, "id" | "role">,
  reportId: string,
  opts: AccessOptions & { includeDrafts?: boolean } = {},
) {
  if (!isUuid(reportId)) throw new WorkspaceAccessError("not_found");
  const db = getDb();
  const [report] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, reportId)).limit(1);
  if (!report) throw new WorkspaceAccessError("not_found");

  const access = await requireWorkspaceAccess(user, report.workspaceId, opts);

  // A draft is invisible to a client even when they are a legitimate member of its workspace.
  // Reported as "not_found" for the same reason every other denial is: a client learning that a
  // draft exists for them is itself a leak of unpublished work.
  const maySeeDrafts = opts.includeDrafts === true && access.via === "admin";
  if (report.status !== "published" && !maySeeDrafts) throw new WorkspaceAccessError("not_found");

  return { access, report };
}

// Authorize one attachment by its id, then hand back everything needed to stream it.
//
// Three independent conditions must hold, and all three are checked server-side here rather than
// anywhere in the UI: the attachment's workspace must be one the caller has access to, the report
// it belongs to must be published (for a client), and the attachment must be marked client-visible.
// An internal attachment on a published report is still refused.
export async function requireAttachmentAccess(
  user: Pick<AppUser, "id" | "role">,
  attachmentId: string,
  opts: AccessOptions = {},
) {
  if (!isUuid(attachmentId)) throw new WorkspaceAccessError("not_found");
  const db = getDb();
  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(eq(reportAttachments.id, attachmentId))
    .limit(1);
  if (!attachment) throw new WorkspaceAccessError("not_found");

  const { access } = await requireReportAccess(user, attachment.reportId, opts);
  const isStaffView = access.via === "admin";
  if (!attachment.visibleToClient && !isStaffView) throw new WorkspaceAccessError("not_found");

  return { access, attachment };
}

// Bulk membership check, for the notification centre: given a set of workspace ids referenced by
// this user's notifications, return the subset they may still act on. Used so a notification that
// outlived its membership stops linking anywhere.
export async function filterAccessibleWorkspaceIds(userId: string, workspaceIds: string[]): Promise<Set<string>> {
  const ids = workspaceIds.filter(isUuid);
  if (ids.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .innerJoin(clientWorkspaces, eq(clientWorkspaces.id, workspaceMembers.workspaceId))
    .where(and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.status, "active"),
      eq(clientWorkspaces.status, "active"),
      inArray(workspaceMembers.workspaceId, ids),
    ));
  return new Set(rows.map(r => r.id));
}

// Every denial becomes an identical 404. See the note on WorkspaceAccess above for why the reason
// is not exposed: distinguishable errors are an enumeration oracle.
export function accessErrorResponse(error: unknown): Response | null {
  if (!(error instanceof WorkspaceAccessError)) return null;
  return Response.json({ error: "Not found." }, { status: 404 });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
