import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcementDeliveries,
  announcements,
  clientWorkspaces,
  profiles,
  workspaceMembers,
} from "@/db/schema";
import { createNotifications, safeInternalLink } from "./notifications";

// Admin announcements: one composer that can reach everybody, one audience segment, or one named
// person, and lands in each recipient's in-app notification centre.
//
// ------------------------------------------------------------------------------------------------
// CHANNEL: IN-APP ONLY, ON PURPOSE.
// ------------------------------------------------------------------------------------------------
// The `announcements` table carries a `channel` column that allows "email" and "both", and the
// delivery table has a full provider status ladder for it. Nothing in this file sends an email.
//
// That is the standing instruction for this build — the broadcast feature is to be built and tested
// without sending a real broadcast to customers — and it is also the honest engineering position:
// an email fan-out that has never actually been run against the provider is not a working feature,
// and wiring it now would mean the first real test of it is a message to live customers. So
// `sendAnnouncement` writes in-app deliveries only, and records channel "in_app" so the audit trail
// says exactly what happened rather than implying an email went out.
//
// An in-app delivery row is marked "delivered" rather than "accepted": for this channel there is no
// third party in between, and the notification row is already readable in the recipient's
// notification centre by the time the transaction commits. "Delivered" is a fact here, not a guess.
// ------------------------------------------------------------------------------------------------

// The audience/category vocabulary and the list-row shape live in lib/announcement-shared.ts so the
// admin composer (a client component) can import them without pulling the database client into the
// browser bundle. Re-exported here so server callers have one import site.
export {
  AUDIENCES,
  AUDIENCE_LABEL,
  CATEGORIES,
} from "./announcement-shared";
export type { Audience, Category, AnnouncementListRow } from "./announcement-shared";

import type { Audience, Category, AnnouncementListRow } from "./announcement-shared";

export type Recipient = { id: string; email: string; marketingOptIn: boolean };

// Resolves an audience to concrete accounts. Every branch reads from `profiles`, so a recipient is
// always a real account with a real id — a broadcast can never be addressed to a lead, an invite, or
// a bare email address that nobody has signed up with.
export async function resolveAudience(audience: Audience, selectedEmails: string[] = []): Promise<Recipient[]> {
  const db = getDb();
  const base = { id: profiles.id, email: profiles.email, marketingOptIn: profiles.marketingOptIn };

  if (audience === "selected") {
    const wanted = [...new Set(selectedEmails.map(e => e.trim().toLowerCase()).filter(Boolean))];
    if (wanted.length === 0) return [];
    // Matched case-insensitively: an admin typing "Buddy@Example.com" must reach the account stored
    // as "buddy@example.com" rather than silently resolving to nobody.
    return db.select(base).from(profiles).where(inArray(sql`lower(${profiles.email})`, wanted));
  }

  if (audience === "subscribers") {
    return db.select(base).from(profiles)
      .where(inArray(profiles.auditEntitlement, ["subscribed", "admin_granted"]));
  }

  if (audience === "audit_users") {
    // "Has actually used the audit product", not "is allowed to" — so this segment is about
    // behaviour, which is what makes it useful for a product announcement.
    return db.select(base).from(profiles)
      .where(sql`exists (select 1 from profile_audits pa where pa.user_id = "profiles"."id" and pa.status = 'completed')`);
  }

  if (audience === "managed_clients") {
    // An ACTIVE membership in an ACTIVE workspace. A revoked member or a suspended client is not a
    // managed client any more, and must not receive a message addressed to that group.
    return db.selectDistinct(base).from(profiles)
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.status, "active")))
      .innerJoin(clientWorkspaces, and(eq(clientWorkspaces.id, workspaceMembers.workspaceId), eq(clientWorkspaces.status, "active")));
  }

  return db.select(base).from(profiles);
}

// Only a path on this site, or nothing. An announcement's action link is free text an admin typed,
// so it goes through the same gate as a notification link — an absolute URL here would turn every
// recipient's notification centre into an open redirect.
export function safeActionUrl(value: string | undefined | null): string {
  return safeInternalLink(typeof value === "string" ? value.trim() : "");
}

export type SendResult = {
  announcementId: string;
  recipientCount: number;
  notificationsCreated: number;
  skippedAsDuplicate: number;
  suppressed: number;
};

/**
 * Creates the announcement record and fans it out to in-app notifications.
 *
 * `dryRun` resolves the audience and returns the counts WITHOUT writing anything — that is what the
 * composer's confirm step calls, so an admin always sees how many real people a broadcast would
 * reach before it exists at all.
 */
export async function sendAnnouncement(input: {
  title: string;
  body: string;
  audience: Audience;
  selectedEmails?: string[];
  category: Category;
  actionLabel?: string;
  actionUrl?: string;
  createdByEmail: string;
  dryRun?: boolean;
}): Promise<SendResult & { recipients: Recipient[] }> {
  const recipients = await resolveAudience(input.audience, input.selectedEmails ?? []);

  // A promotional announcement honours the marketing preference. A service notification does not,
  // and must not: a client cannot be allowed to opt out of being told that their access changed or
  // that their report is ready. This is the only place the distinction is applied.
  const targeted = input.category === "promotional" ? recipients.filter(r => r.marketingOptIn) : recipients;
  const suppressed = recipients.length - targeted.length;

  if (input.dryRun) {
    return {
      announcementId: "",
      recipientCount: targeted.length,
      notificationsCreated: 0,
      skippedAsDuplicate: 0,
      suppressed,
      recipients: targeted,
    };
  }

  const db = getDb();
  const actionUrl = safeActionUrl(input.actionUrl);

  const [created] = await db.insert(announcements).values({
    title: input.title,
    body: input.body,
    audience: input.audience,
    audienceUserIds: JSON.stringify(targeted.map(r => r.id)),
    channel: "in_app",
    category: input.category,
    actionLabel: actionUrl ? (input.actionLabel ?? "").slice(0, 60) : "",
    actionUrl,
    status: "sending",
    recipientCount: targeted.length,
    createdByEmail: input.createdByEmail,
  }).returning({ id: announcements.id });

  const announcementId = created.id;

  // The notification's link is the announcement's action link when it has one, and otherwise the
  // notification centre itself — never an empty anchor.
  const notificationsCreated = await createNotifications(targeted.map(r => ({
    userId: r.id,
    kind: "announcement" as const,
    title: input.title,
    body: input.body,
    link: actionUrl || "/notifications",
    // One announcement can reach one person once. The unique index on
    // (user_id, kind, dedupe_key) turns a retry of the same send into a no-op rather than a second
    // copy in somebody's list.
    dedupeKey: `announcement:${announcementId}`,
    announcementId,
  })));

  if (targeted.length > 0) {
    await db.insert(announcementDeliveries).values(targeted.map(r => ({
      announcementId,
      userId: r.id,
      userEmail: r.email,
      channel: "in_app",
      status: "delivered",
    }))).onConflictDoNothing({
      target: [announcementDeliveries.announcementId, announcementDeliveries.userId, announcementDeliveries.channel],
    });
  }

  // Recipients who were filtered out by their marketing preference are recorded too, with the
  // reason — so "why did this person not get it" has an answer in the data rather than being
  // reconstructed from the audience definition later.
  const suppressedRows = input.category === "promotional" ? recipients.filter(r => !r.marketingOptIn) : [];
  if (suppressedRows.length > 0) {
    await db.insert(announcementDeliveries).values(suppressedRows.map(r => ({
      announcementId,
      userId: r.id,
      userEmail: r.email,
      channel: "in_app",
      status: "suppressed",
      suppressionReason: "marketing_opt_out",
    }))).onConflictDoNothing({
      target: [announcementDeliveries.announcementId, announcementDeliveries.userId, announcementDeliveries.channel],
    });
  }

  await db.update(announcements)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(announcements.id, announcementId));

  return {
    announcementId,
    recipientCount: targeted.length,
    notificationsCreated,
    // Reported plainly rather than folded into the success count: if an admin re-sends the same
    // announcement id, the honest report is "0 new, 12 already had it", not "12 sent".
    skippedAsDuplicate: targeted.length - notificationsCreated,
    suppressed,
    recipients: targeted,
  };
}

export async function listAnnouncements(limit = 50): Promise<AnnouncementListRow[]> {
  const db = getDb();
  const rows = await db.select({
    id: announcements.id,
    title: announcements.title,
    body: announcements.body,
    audience: announcements.audience,
    category: announcements.category,
    channel: announcements.channel,
    status: announcements.status,
    recipientCount: announcements.recipientCount,
    actionLabel: announcements.actionLabel,
    actionUrl: announcements.actionUrl,
    createdByEmail: announcements.createdByEmail,
    createdAt: announcements.createdAt,
    sentAt: announcements.sentAt,
    // How many recipients have actually opened it. Written as "announcements"."id" in full and with
    // the inner table aliased — an unqualified interpolated column inside a correlated subquery is
    // the exact bug that once took /admin down with Postgres 21000. See app/admin/page.tsx.
    readCount: sql<number>`(select count(*)::int from notifications n where n.announcement_id = "announcements"."id" and n.read_at is not null)`,
  }).from(announcements).orderBy(desc(announcements.createdAt)).limit(limit);

  return rows.map(row => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  }));
}
