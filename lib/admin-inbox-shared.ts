// Labels and row shapes for the admin inbound queues, shared by the server reader
// (lib/admin-inbox.ts) and the client cards (app/admin/inbox-cards.tsx).
//
// Separate from lib/admin-inbox.ts because that file imports the database client; importing a label
// from it inside a client component would pull server-only modules into the browser bundle.

export type AdminLeadRow = {
  id: string;
  name: string;
  email: string;
  profileLink: string;
  goals: string;
  source: string;
  status: string;
  hasAccount: boolean;
  createdAt: string;
};

export type AdminManagementEnquiryRow = {
  id: string;
  userEmail: string;
  message: string;
  status: string;
  handledByEmail: string;
  createdAt: string;
};

// Which form on the public site produced a lead. A lookup rather than prettified inline, so an
// unrecognised value shows the raw source instead of silently reading as something it is not.
export const LEAD_SOURCE_LABEL: Record<string, string> = {
  landing_audit: "Landing — free audit",
  landing_client_portal: "Landing — client portal",
  landing_general: "Landing — general enquiry",
  client_portal_access_request: "Portal access request",
};

export const LEAD_STATUSES = ["new", "reviewed", "actioned"] as const;
// "converted" means "a human decided to take this person on". It grants NOTHING by itself — the
// managed-client membership is created separately, against a verified account id.
export const MANAGEMENT_ENQUIRY_STATUSES = ["new", "contacted", "converted", "declined"] as const;
