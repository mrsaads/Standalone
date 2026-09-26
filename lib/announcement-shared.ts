// Announcement vocabulary shared by the server and the admin composer.
//
// Kept apart from lib/announcements.ts on purpose: that file imports the database client, and a
// client component that imported a label from it would drag the server-only Drizzle/pg module into
// the browser bundle (and fail the build). Same reasoning as lib/destination-shared.ts.

export const AUDIENCES = ["everyone", "audit_users", "subscribers", "managed_clients", "selected"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<Audience, string> = {
  everyone: "Everyone with an account",
  audit_users: "People who have run at least one audit",
  subscribers: "Subscribers and granted accounts",
  managed_clients: "Managed clients (active portal access)",
  selected: "Specific people (by email)",
};

export const CATEGORIES = ["service", "promotional"] as const;
export type Category = (typeof CATEGORIES)[number];

export type AnnouncementListRow = {
  id: string;
  title: string;
  body: string;
  audience: string;
  category: string;
  channel: string;
  status: string;
  recipientCount: number;
  readCount: number;
  actionLabel: string;
  actionUrl: string;
  createdByEmail: string;
  createdAt: string;
  sentAt: string | null;
};
