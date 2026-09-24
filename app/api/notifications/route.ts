import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { countUnread, listNotifications, markAllRead, markRead } from "@/lib/notifications";
import { isUuid } from "@/lib/workspace-access";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });

// Every query in lib/notifications.ts is scoped to the caller's own user id, so there is no way to
// read or mutate another account's notifications through this route — passing someone else's id
// simply matches zero rows rather than being refused, which is the safer failure shape here.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in required." }, 401);
  const [rows, unread] = await Promise.all([listNotifications(user.id), countUnread(user.id)]);
  return json({
    unread,
    notifications: rows.map(row => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      link: row.link,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  }, 200);
}

const bodySchema = z.union([
  z.object({ all: z.literal(true) }).strict(),
  z.object({ ids: z.array(z.string()).min(1).max(200) }).strict(),
]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in required." }, 401);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the Improvexus app." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Invalid request." }, 415);
  }

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);

  if ("all" in parsed.data) {
    const updated = await markAllRead(user.id);
    return json({ ok: true, updated, unread: await countUnread(user.id) }, 200);
  }

  // Filter to well-formed uuids before the query so a malformed id raises a 400 here rather than a
  // Postgres cast error (and a 500) deeper in.
  const ids = parsed.data.ids.filter(isUuid);
  if (ids.length === 0) return json({ error: "Invalid request." }, 400);
  const updated = await markRead(user.id, ids);
  return json({ ok: true, updated, unread: await countUnread(user.id) }, 200);
}
