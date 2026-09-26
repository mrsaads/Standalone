// Shapes shared by the client-portal admin reader (lib/admin-clients.ts) and the admin UI
// (app/admin/clients/*). Separate from the reader because that file imports the database client,
// which must never reach the browser bundle.

export type AdminMemberRow = {
  id: string;
  userEmail: string;
  status: string;
  grantedByEmail: string;
  grantedAt: string;
  revokedAt: string | null;
};

export type AdminWorkspaceProfileRow = {
  id: string;
  name: string;
  upworkUrl: string;
  status: string;
  sortOrder: number;
};

export type AdminReportRow = {
  id: string;
  workspaceProfileId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  title: string;
  publishedAt: string | null;
  publishedByEmail: string;
  metricCount: number;
  createdAt: string;
};

export type AdminWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  serviceStartDate: string | null;
  objectives: string;
  accountManager: string;
  createdByEmail: string;
  createdAt: string;
  members: AdminMemberRow[];
  profiles: AdminWorkspaceProfileRow[];
  reports: AdminReportRow[];
};

export const WORKSPACE_STATUSES = ["active", "suspended"] as const;
export const PROFILE_STATUSES = ["active", "archived"] as const;
export const REPORT_STATUSES = ["draft", "published"] as const;

// The fields of a weekly report an admin fills in. Every one is plain text the admin writes — no AI
// call is involved in producing a weekly report, so this whole section keeps working regardless of
// the AI credit balance.
export const REPORT_TEXT_FIELDS = [
  { key: "title", label: "Title", rows: 1, placeholder: "Week of 22 September" },
  { key: "overview", label: "Profile overview", rows: 3, placeholder: "Where the profile stands this week." },
  { key: "goals", label: "Goals for this period", rows: 3, placeholder: "What we set out to do." },
  { key: "workCompleted", label: "Work completed", rows: 4, placeholder: "What we actually did." },
  { key: "nextActions", label: "Next actions (us)", rows: 3, placeholder: "What we will do next." },
  { key: "clientActions", label: "Needs the client to act", rows: 3, placeholder: "Anything you need from them. Leave empty if nothing." },
] as const;

export type ReportTextKey = (typeof REPORT_TEXT_FIELDS)[number]["key"];
