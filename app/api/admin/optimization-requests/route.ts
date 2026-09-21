import { desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { optimizationRequests } from "@/db/schema";

const headers = { "Cache-Control": "no-store" };

// Lists the "request optimization by a person" queue for the admin panel. Admin-only.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403, headers });
  const db = getDb();
  const rows = await db.select().from(optimizationRequests).orderBy(desc(optimizationRequests.createdAt)).limit(200);
  return Response.json({
    requests: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
  }, { headers });
}
