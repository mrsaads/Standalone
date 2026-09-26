import { redirect } from "next/navigation";
import { AuthRequiredError, requireCurrentUser, type AppUser } from "@/lib/auth";
import { getAdminOverview, navCountsFrom, type AdminOverview } from "@/lib/admin-stats";

// One authorization + one stats read, shared by every admin page.
//
// Why a helper rather than five copies: the check is identical everywhere and a copy is a place for
// it to drift. A page that forgot the `role !== "admin"` line would be a real hole — the API routes
// behind it would still refuse a non-admin, but the page itself would render the data it had
// already loaded on the server before those routes were ever called.
//
// This is a *page* guard. It is not the only guard: every admin API route re-checks the role
// itself, independently, because a page and the routes it calls are separate entry points and
// only one of them is reached by clicking a link.
export async function requireAdminPage(): Promise<{
  user: AppUser;
  overview: AdminOverview;
  navCounts: ReturnType<typeof navCountsFrom>;
}> {
  let user: AppUser;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    if (error instanceof AuthRequiredError) redirect("/login");
    throw error;
  }
  // A signed-in customer who types /admin lands back on their own dashboard, not on an error page:
  // there is nothing here for them and a 403 screen would only invite them to wonder what is.
  if (user.role !== "admin") redirect("/");

  const overview = await getAdminOverview();
  return { user, overview, navCounts: navCountsFrom(overview) };
}
