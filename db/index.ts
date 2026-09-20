import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// A single pooled connection reused across requests. Render's Node runtime (unlike Cloudflare
// Workers) keeps a warm process between requests, so a module-level singleton is the correct
// pattern here — recreating a client per-request would exhaust Supabase's connection limit.
let _client: ReturnType<typeof postgres> | null = null;

function client() {
  if (_client) return _client;
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("SUPABASE_DB_URL (or DATABASE_URL) is not configured.");
  // `prepare: false` is required for Supabase's connection pooler (pgbouncer, transaction mode).
  _client = postgres(url, { prepare: false, max: 5 });
  return _client;
}

export function getDb() {
  return drizzle(client(), { schema });
}
