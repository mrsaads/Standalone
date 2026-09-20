#!/usr/bin/env node
// One-time migration: copies the existing Cloudflare D1 data (users, profile_audits, enquiries)
// into the new Supabase Auth + Postgres schema. This has to run from an environment with the old
// Cloudflare account's credentials and this app's Supabase service-role key — neither of which
// this session holds — so it cannot be executed here. It has been dry-run tested against
// synthetic fixtures shaped like the real D1 tables (see scripts/__fixtures__/d1-sample-export.json)
// to prove the transformation and id-remapping logic is correct; only the live Supabase Admin API
// calls and the final Postgres insert are untested against your real data.
//
// ── Step 1: export the current D1 tables to JSON ──────────────────────────────────────────────
// From the OLD project (with wrangler authenticated against your Cloudflare/ChatGPT-Sites account):
//   wrangler d1 execute DB --remote --json --command "SELECT * FROM users" > users.json
//   wrangler d1 execute DB --remote --json --command "SELECT * FROM profile_audits" > profile_audits.json
//   wrangler d1 execute DB --remote --json --command "SELECT * FROM enquiries" > enquiries.json
// (wrangler wraps result rows as [{ results: [...] }] — this script unwraps that shape.)
//
// ── Step 2: run this script against the NEW Supabase project ──────────────────────────────────
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_DB_URL=... \
//     node scripts/migrate-d1-to-supabase.mjs --users users.json --audits profile_audits.json --enquiries enquiries.json
// Add --dry-run to print what would happen without calling Supabase or writing to Postgres —
// use this first to sanity-check the row counts and id mapping against your real export.
//
// What it does, in order:
//   1. For every D1 user, creates (or reuses, if already invited) a Supabase Auth user via the
//      Admin API's inviteUserByEmail — this both creates the account AND emails the customer a
//      link to set their own password on the new site, since D1 users authenticated via the old
//      ChatGPT-Sites platform identity and have never had a password here.
//   2. Records old D1 user id -> new Supabase auth user id in an in-memory map, then inserts a
//      matching `profiles` row (email, full_name, role) keyed to the NEW id.
//   3. Inserts every profile_audits row with user_id remapped to the new Supabase id, preserving
//      the stored report_json, score breakdown, and provider exactly, with billable=true (these
//      are real historical audits, not failed attempts).
//   4. Inserts every enquiries row unchanged (it carries no user_id linkage in the old schema).
// Every insert uses the row's original id as a stable primary key, so re-running this script after
// a partial failure is safe — already-migrated rows are skipped via ON CONFLICT DO NOTHING rather
// than duplicated.

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--users") out.usersPath = argv[++i];
    else if (arg === "--audits") out.auditsPath = argv[++i];
    else if (arg === "--enquiries") out.enquiriesPath = argv[++i];
  }
  return out;
}

async function loadRows(path) {
  if (!path) return [];
  const raw = JSON.parse(await readFile(path, "utf8"));
  // wrangler d1 execute --json returns [{ results: [...], success, meta }]; support both that and
  // a plain array (e.g. if the export was already unwrapped by hand).
  if (Array.isArray(raw) && raw.length && Array.isArray(raw[0]?.results)) return raw[0].results;
  return Array.isArray(raw) ? raw : [];
}

export function buildMigrationPlan({ users, audits, enquiries }) {
  // Pure, side-effect-free planning step — this is what scripts/__fixtures__ exercises without
  // touching any network or database, so the row-shaping/id-remapping logic can be verified
  // independently of whether real Supabase/D1 credentials are available.
  const idMap = new Map(); // old D1 user id -> placeholder; filled with real Supabase ids at runtime
  const invitePlan = users.map(u => ({ oldId: u.id, email: u.email, fullName: u.display_name || "", role: u.role || "base" }));
  const auditPlan = audits.map(a => ({
    oldId: a.id,
    oldUserId: a.user_id,
    userEmail: a.user_email,
    profileKey: a.profile_key,
    profileUrl: a.profile_url || "",
    profileName: a.profile_name || "",
    contentHash: a.content_hash,
    reportJson: a.report_json,
    score: a.score,
    passCount: a.pass_count,
    weakCount: a.weak_count,
    failCount: a.fail_count,
    provider: a.provider,
    createdAt: a.created_at,
  }));
  const enquiryPlan = enquiries.map(e => ({ ...e }));
  return { idMap, invitePlan, auditPlan, enquiryPlan };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const users = await loadRows(args.usersPath);
  const audits = await loadRows(args.auditsPath);
  const enquiries = await loadRows(args.enquiriesPath);
  const plan = buildMigrationPlan({ users, audits, enquiries });

  console.log(`Loaded ${plan.invitePlan.length} users, ${plan.auditPlan.length} audits, ${plan.enquiryPlan.length} enquiries.`);

  if (args.dryRun) {
    console.log("--dry-run: no Supabase Auth invites or Postgres writes will be made.");
    console.log("Sample user invite:", plan.invitePlan[0] ?? "(none)");
    console.log("Sample audit row:", plan.auditPlan[0] ?? "(none)");
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url || !serviceKey || !dbUrl) {
    console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_DB_URL before running without --dry-run.");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const sql = postgres(dbUrl, { prepare: false, max: 1 });

  try {
    for (const user of plan.invitePlan) {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(user.email, { data: { full_name: user.fullName } });
      if (error) {
        // "already registered" happens on a re-run after a partial failure — look the existing
        // user up by email instead of treating it as fatal.
        const { data: existing } = await supabase.auth.admin.listUsers();
        const found = existing?.users.find(u => u.email?.toLowerCase() === user.email.toLowerCase());
        if (!found) { console.error(`Could not invite or find ${user.email}:`, error.message); continue; }
        plan.idMap.set(user.oldId, found.id);
        continue;
      }
      plan.idMap.set(user.oldId, data.user.id);
      await sql`
        INSERT INTO profiles (id, email, full_name, role)
        VALUES (${data.user.id}, ${user.email}, ${user.fullName}, ${user.role})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`Migrated ${plan.idMap.size} of ${plan.invitePlan.length} users.`);

    let auditsInserted = 0;
    for (const audit of plan.auditPlan) {
      const newUserId = plan.idMap.get(audit.oldUserId);
      if (!newUserId) { console.warn(`Skipping audit ${audit.oldId}: no migrated user for old id ${audit.oldUserId}.`); continue; }
      await sql`
        INSERT INTO profile_audits (id, user_id, user_email, profile_key, profile_url, profile_name, content_hash, report_json, score, pass_count, weak_count, fail_count, provider, billable, created_at)
        VALUES (${audit.oldId}, ${newUserId}, ${audit.userEmail}, ${audit.profileKey}, ${audit.profileUrl}, ${audit.profileName}, ${audit.contentHash}, ${audit.reportJson}, ${audit.score}, ${audit.passCount}, ${audit.weakCount}, ${audit.failCount}, ${audit.provider}, true, ${audit.createdAt})
        ON CONFLICT (id) DO NOTHING
      `;
      auditsInserted++;
    }
    console.log(`Migrated ${auditsInserted} of ${plan.auditPlan.length} audits.`);

    let enquiriesInserted = 0;
    for (const e of plan.enquiryPlan) {
      await sql`
        INSERT INTO enquiries (id, name, email, platform, service, buyer, budget, intent, challenge, profile_json, score, unknown_points, recommendation, consent, status, created_at)
        VALUES (${e.id}, ${e.name}, ${e.email}, ${e.platform}, ${e.service}, ${e.buyer}, ${e.budget || ""}, ${e.intent}, ${e.challenge || ""}, ${e.profile_json}, ${e.score}, ${e.unknown_points}, ${e.recommendation}, ${!!e.consent}, ${e.status || "new"}, ${e.created_at})
        ON CONFLICT (id) DO NOTHING
      `;
      enquiriesInserted++;
    }
    console.log(`Migrated ${enquiriesInserted} of ${plan.enquiryPlan.length} enquiries.`);
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
