import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";

// In-app notifications.
//
// Creation is idempotent by construction: every notification carries a `dedupeKey` naming the thing
// it is about, and the unique index on (user_id, kind, dedupe_key) turns a repeat into a no-op via
// ON CONFLICT DO NOTHING. That is what makes "publishing the same report twice" or "a retried
// request" safe — the duplicate is refused by the database, not by a check that could race.

export type NotificationKind =
  | "managed_access_granted"
  | "weekly_report_published"
  | "audit_completed"
  | "action_required"
  | "announcement";

export type NewNotification = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  // Must be an application-relative path built by our own server code. Never a URL taken from a
  // form or from an admin's free-text field — see `safeInternalLink`.
  link?: string;
  dedupeKey: string;
  announcementId?: string | null;
};

// Only same-origin, path-only links are allowed to reach the notification centre. An absolute URL,
// a protocol-relative "//evil.example", or a javascript: URI would all turn an in-app notification
// into an open redirect, so they are rejected here rather than sanitized into something ambiguous.
export function safeInternalLink(link: string | undefined | null): string {
  if (!link) return "";
  if (!link.startsWith("/")) return "";
  if (link.startsWith("//")) return "";
  return link;
}

export async function createNotifications(items: NewNotification[]): Promise<number> {
  if (items.length === 0) return 0;
  const db = getDb();
  const rows = await db.insert(notifications).values(
    items.map(item => ({
      userId: item.userId,
      kind: item.kind,
      title: item.title,
      body: item.body ?? "",
      link: safeInternalLink(item.link),
      dedupeKey: item.dedupeKey,
      announcementId: item.announcementId ?? null,
    })),
  ).onConflictDoNothing({
    target: [notifications.userId, notifications.kind, notifications.dedupeKey],
  }).returning({ id: notifications.id });
  // The count of rows ACTUALLY inserted, not the count requested — so a caller reporting "3 people
  // notified" is reporting reality after dedupe, not its own intent.
  return rows.length;
}

export async function listNotifications(userId: string, limit = 50) {
  const db = getDb();
  return db.select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnread(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.count ?? 0);
}

// Mark specific notifications read. Scoped to the caller's own user id in the WHERE clause, so a
// caller passing someone else's notification id simply matches zero rows.
export async function markRead(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDb();
  const rows = await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(notifications.userId, userId),
      inArray(notifications.id, ids),
      isNull(notifications.readAt),
    ))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function markAllRead(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}
