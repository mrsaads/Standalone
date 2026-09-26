import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { optimizationRequests } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin-guard";
import { AdminShell } from "../admin-shell";
import { RequestsAdmin } from "./requests-admin";

export const dynamic = "force-dynamic";

// Optimization requests. Read here on the server rather than through /api/admin/optimization-requests
// on mount — that route still exists and is still admin-only, but a page that already runs on the
// server has no reason to make the browser ask it a question it can answer itself.
export default async function AdminRequestsPage() {
  const { user, navCounts } = await requireAdminPage();

  const db = getDb();
  const rows = await db.select().from(optimizationRequests).orderBy(desc(optimizationRequests.createdAt)).limit(200);

  return (
    <AdminShell
      adminEmail={user.email}
      counts={navCounts}
      title="Optimization requests"
      description="People who read their audit and asked for a person to work on their profile."
    >
      <RequestsAdmin
        initial={rows.map(r => ({
          id: r.id,
          userEmail: r.userEmail,
          auditId: r.auditId ?? null,
          profileUrl: r.profileUrl,
          notes: r.notes,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </AdminShell>
  );
}
