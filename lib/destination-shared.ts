// Client-safe half of lib/destination.ts — no server-only imports (getDb/postgres), so client
// components (app/login/page.tsx, app/signup/page.tsx) can import this without pulling a Node-only
// Postgres driver into the browser bundle. The DB-touching resolver lives in lib/destination.ts.
export type Destination = "audit" | "client_portal";
export function isDestination(value: unknown): value is Destination {
  return value === "audit" || value === "client_portal";
}
export const DESTINATION_PATH: Record<Destination, string> = { audit: "/audit", client_portal: "/client-portal" };
