import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leads, managementEnquiries } from "@/db/schema";

// The admin's inbound queue: everything a person submitted that is waiting on a human.
//
// Why this file exists at all — the bug it fixes:
//
// The admin panel had exactly ONE inbound card, "Optimization requests", reading
// `optimization_requests`. But nothing on the public site writes to that table. The landing page's
// enquiry form posts to /api/leads, which writes `leads` (see lib/leads.ts); the signed-in
// dashboard's "Request management" button posts to /api/management-enquiries, which writes
// `management_enquiries`. `optimization_requests` is only ever written from the report's own
// Optimization tab.
//
// So real submissions were being stored correctly and then never shown anywhere: the admin card
// queried a third, unrelated table that happened to be empty. Nothing was lost — the rows were in
// the database the whole time. These two readers are the missing half.
//
// Both are admin-only reads and neither is ever exposed to a customer route.

// Row shapes, labels and the status vocabularies live in lib/admin-inbox-shared.ts so the admin
// cards (a client component) can import them without pulling the database client into the browser
// bundle. Re-exported here so server callers have one import site.
export { LEAD_SOURCE_LABEL, LEAD_STATUSES, MANAGEMENT_ENQUIRY_STATUSES } from "./admin-inbox-shared";
export type { AdminLeadRow, AdminManagementEnquiryRow } from "./admin-inbox-shared";

import type { AdminLeadRow, AdminManagementEnquiryRow } from "./admin-inbox-shared";

export async function listLeadsForAdmin(limit = 200): Promise<AdminLeadRow[]> {
  const db = getDb();
  const rows = await db.select({
    id: leads.id,
    name: leads.name,
    email: leads.email,
    profileLink: leads.profileLink,
    goals: leads.goals,
    source: leads.source,
    status: leads.status,
    // Whether this enquiry came from someone who already has an account. Useful context before
    // replying, and it is the one thing a bare lead row cannot tell you. Written in full as
    // "leads"."user_id" — see the comment block in app/admin/page.tsx for why an unqualified
    // column inside a correlated subquery took this page down once already.
    hasAccount: sql<boolean>`("leads"."user_id" is not null)`,
    createdAt: leads.createdAt,
  }).from(leads).orderBy(desc(leads.createdAt)).limit(limit);
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function listManagementEnquiriesForAdmin(limit = 200): Promise<AdminManagementEnquiryRow[]> {
  const db = getDb();
  const rows = await db.select({
    id: managementEnquiries.id,
    userEmail: managementEnquiries.userEmail,
    message: managementEnquiries.message,
    status: managementEnquiries.status,
    handledByEmail: managementEnquiries.handledByEmail,
    createdAt: managementEnquiries.createdAt,
  }).from(managementEnquiries).orderBy(desc(managementEnquiries.createdAt)).limit(limit);
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

