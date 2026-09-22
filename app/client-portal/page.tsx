import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireCurrentUser, AuthRequiredError } from "@/lib/auth";
import { getDb } from "@/db";
import { clientWorkspaces, workspaceMembers, workspaceProfiles } from "@/db/schema";
import { ClientPortalAssigned, ClientPortalAccessRequest } from "./client-portal-view";

// Server component: resolves assignment the same way lib/destination.ts's isAssignedClient() does
// (an active workspaceMembers row in an active workspace) and branches between the two screens the
// spec asks for. Membership is manual-admin-only — nothing on this page, or on the access-request
// form it renders when unassigned, can create a workspaceMembers row itself.
export default async function ClientPortalPage() {
  let user;
  try { user = await requireCurrentUser(); }
  catch (error) { if (error instanceof AuthRequiredError) redirect("/login?destination=client_portal"); throw error; }
  if (user.role === "admin") redirect("/admin");

  const db = getDb();
  const memberships = await db
    .select({
      workspaceId: clientWorkspaces.id,
      name: clientWorkspaces.name,
      objectives: clientWorkspaces.objectives,
      accountManagerEmail: clientWorkspaces.accountManagerEmail,
    })
    .from(workspaceMembers)
    .innerJoin(clientWorkspaces, eq(clientWorkspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.status, "active"), eq(clientWorkspaces.status, "active")));

  if (memberships.length === 0) {
    return <ClientPortalAccessRequest email={user.email} fullName={user.fullName} />;
  }

  const profilesByWorkspace = await Promise.all(memberships.map(async m => {
    const rows = await db.select({ id: workspaceProfiles.id, name: workspaceProfiles.name, upworkUrl: workspaceProfiles.upworkUrl })
      .from(workspaceProfiles).where(and(eq(workspaceProfiles.workspaceId, m.workspaceId), eq(workspaceProfiles.status, "active")));
    return { ...m, profiles: rows };
  }));

  return <ClientPortalAssigned email={user.email} workspaces={profilesByWorkspace} />;
}
