import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { logAdminAction } from "@/lib/admin-log";
import { AUDIENCES, CATEGORIES, listAnnouncements, resolveAudience, sendAnnouncement } from "@/lib/announcements";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });

// Admin-only. Lists what has been sent, previews an audience, and sends an announcement.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  return json({ announcements: await listAnnouncements() }, 200);
}

const bodySchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(1).max(4000),
  audience: z.enum(AUDIENCES),
  // Only meaningful when audience = "selected". Up to 50 at a time so "send to one person" and
  // "send to this handful of clients" are the same control.
  emails: z.array(z.string().trim().email().max(254)).max(50).optional().default([]),
  category: z.enum(CATEGORIES).default("service"),
  actionLabel: z.string().trim().max(60).optional().default(""),
  // Validated again server-side in lib/announcements.ts — an absolute URL is dropped, never stored.
  actionUrl: z.string().trim().max(300).optional().default(""),
  // The composer calls this first with preview: true to show a real recipient count before anything
  // is written. Nothing is created and nobody is notified on a preview.
  preview: z.boolean().optional().default(false),
}).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Check the title, the message, and the audience." }, 400);
  }
  const data = parsed.data;

  if (data.audience === "selected" && data.emails.length === 0) {
    return json({ error: "Enter at least one email address, or choose a different audience." }, 400);
  }

  if (data.preview) {
    const recipients = await resolveAudience(data.audience, data.emails);
    const willReach = data.category === "promotional" ? recipients.filter(r => r.marketingOptIn) : recipients;
    // For "selected", say plainly which typed addresses matched no account. Silently dropping them
    // would let an admin believe they had messaged somebody they had not.
    const matched = new Set(recipients.map(r => r.email.toLowerCase()));
    const unmatched = data.audience === "selected"
      ? data.emails.map(e => e.toLowerCase()).filter(e => !matched.has(e))
      : [];
    return json({
      preview: true,
      recipientCount: willReach.length,
      suppressed: recipients.length - willReach.length,
      unmatched,
      // Shown in the confirm step so an admin sees who this actually goes to, not just a number.
      sample: willReach.slice(0, 25).map(r => r.email),
    }, 200);
  }

  const result = await sendAnnouncement({
    title: data.title,
    body: data.body,
    audience: data.audience,
    selectedEmails: data.emails,
    category: data.category,
    actionLabel: data.actionLabel,
    actionUrl: data.actionUrl,
    createdByEmail: user.email,
  });

  await logAdminAction(
    user.email,
    "announcement_sent",
    "announcement",
    result.announcementId,
    `${data.audience}/${data.category} -> ${result.notificationsCreated} notified (${result.recipientCount} in audience, ${result.suppressed} suppressed), in-app only`,
  );

  return json({
    ok: true,
    announcementId: result.announcementId,
    recipientCount: result.recipientCount,
    notificationsCreated: result.notificationsCreated,
    skippedAsDuplicate: result.skippedAsDuplicate,
    suppressed: result.suppressed,
  }, 201);
}
