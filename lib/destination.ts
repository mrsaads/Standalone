import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientWorkspaces, workspaceMembers } from "@/db/schema";
import type { AppUser } from "@/lib/auth";
import { DESTINATION_PATH, isDestination, type Destination } from "@/lib/destination-shared";

// Server-only: this touches the DB, so it must never be imported from a "use client" file — see
// lib/destination-shared.ts for the client-safe types/helpers those files use instead.
export type { Destination };
export { isDestination };

// A user is "assigned" purely by an active workspaceMembers row in an active workspace — never by
// profiles.plan/role. Manual-admin-grant only; a marketing lead or a self-selected "Client Portal"
// card click never creates this row (see lib/leads.ts).
export async function isAssignedClient(userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .innerJoin(clientWorkspaces, eq(clientWorkspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active"), eq(clientWorkspaces.status, "active")))
    .limit(1);
  return !!row;
}

// The default/"general log in or sign up" resolution: stored preference first, then assigned
// clients default to the portal, everyone else to the audit workspace. Admins are handled here
// too so every entry point (root "/", login, signup verification) makes the same call.
export async function resolveAuthorizedPath(user: AppUser): Promise<string> {
  if (user.role === "admin") return "/admin";
  if (isDestination(user.preferredDestination)) return DESTINATION_PATH[user.preferredDestination];
  return (await isAssignedClient(user.id)) ? "/client-portal" : "/audit";
}

// A card-driven visit ("Select Profile Audit" / "Select Client Portal") always wins for that one
// navigation, regardless of stored preference — it does not overwrite the stored preference either
// (only signup does that, once, as the new account's sensible first default). Admins still always
// land on /admin: an owner clicking a workspace card on the marketing page should not get routed
// away from the admin dashboard.
export function destinationPath(user: AppUser, destination: Destination): string {
  if (user.role === "admin") return "/admin";
  return DESTINATION_PATH[destination];
}
