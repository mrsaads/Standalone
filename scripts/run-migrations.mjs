// Applies every SQL file under ./drizzle, in order, to SUPABASE_DB_URL (or DATABASE_URL).
// Run once per deploy target (locally against a dev Supabase project, then again against
// production) via `npm run db:migrate`. Uses drizzle-orm's own postgres-js migrator so this
// tracks applied migrations the same way `drizzle-kit generate` names them — no separate
// migration-tracking table to hand-maintain.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set SUPABASE_DB_URL (or DATABASE_URL) before running migrations.");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied successfully.");
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
