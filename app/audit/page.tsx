import { redirect } from "next/navigation";

// The audit workspace moved to /audits in the managed-clients redesign. This route is kept only so
// old bookmarks and already-sent "your audit is ready" emails (…/audit?openAudit=<id>) still land
// on the right screen instead of a 404.
export default async function LegacyAuditRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const openAudit = typeof params.openAudit === "string" && /^[0-9a-f-]{36}$/i.test(params.openAudit) ? params.openAudit : "";
  redirect(openAudit ? `/audits?openAudit=${openAudit}` : "/audits");
}
