// LOCAL-ONLY: gives the seeded free account one completed audit with a real report behind it, so
// the free-plan lock can be inspected on screen. Refuses to run against anything but localhost.
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { sampleAuditReport } from "../lib/audit-preview";

const url = process.env.DATABASE_URL || "";
if (!/127\.0\.0\.1|localhost/.test(url)) { console.error("Refusing: DATABASE_URL is not local."); process.exit(1); }

const db = getDb();
const reportJson = JSON.stringify(sampleAuditReport);
const result = await db.execute(sql`
  insert into profile_audits
    (user_id, user_email, profile_key, content_hash, profile_name, status, billable, provider, report_json, score, pass_count, weak_count, fail_count, created_at)
  select id, email, 'k-free', 'h-free', 'Jawad A.', 'completed', true, 'openai', ${reportJson}, 9.0, 9, 8, 1, now() - interval '1 day'
  from profiles where email = 'hamza@example.com'
  returning id, user_id
`);
const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) as { id: string; user_id: string }[];
console.log(`AUDIT_ID=${rows[0].id}`);
console.log(`FREE_USER_ID=${rows[0].user_id}`);
process.exit(0);
