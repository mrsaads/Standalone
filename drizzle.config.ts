import type { Config } from "drizzle-kit";

// Used by `npm run db:generate` (drizzle-kit generate) to produce SQL migration files from
// db/schema.ts into ./drizzle. Actually applying them is done by `npm run db:migrate`
// (scripts/run-migrations.mjs), which runs against SUPABASE_DB_URL / DATABASE_URL at deploy time.
export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "",
  },
} satisfies Config;
