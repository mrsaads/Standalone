// Enquiry-form rules, tested against the real validator and a real Postgres.
//   DATABASE_URL=postgres://… npx tsx scripts/local-tests/lead-form.local-test.mts
// The database needs drizzle/0009_lead_whatsapp_country_page.sql applied.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { normalizePhone, normalizeUpworkLink, saveLead, validateLead } from "../../lib/leads";

let pass = 0, fail = 0;
const assert = (ok: unknown, label: string) => { if (ok) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); } };
const section = (title: string) => console.log(`\n${title}`);

const good = () => ({
  submissionId: randomUUID(), name: "Ayesha Khan", email: "Ayesha@Example.com",
  mobileCountry: "PK", mobileNumber: "0300 1234567", whatsappCountry: "PK", whatsappNumber: "0300 1234567",
  profileLink: "https://www.upwork.com/freelancers/~01abcdef", goals: "I send 15 proposals a week and get almost no replies.",
  source: "landing_general" as const, sourcePage: "/", consent: true, website: "",
});
const fieldsOf = (input: unknown) => { const r = validateLead(input); return r.ok ? {} : r.fields; };

section("A. Phone numbers");
{
  const pk = normalizePhone("PK", "0300 123-4567", "mobile number");
  assert(pk.ok && pk.value === "+92 3001234567", "Pakistani number: trunk 0 dropped, stored as +92 3001234567");
  assert(pk.ok && pk.e164 === "923001234567", "…and the WhatsApp/tel form is 923001234567");
  const uk = normalizePhone("GB", "07911 123456", "mobile number");
  assert(uk.ok && uk.value === "+44 7911123456", "UK number: 07911… becomes +44 7911123456");
  const us = normalizePhone("US", "(415) 555-2671", "mobile number");
  assert(us.ok && us.value === "+1 4155552671", "US number with brackets and dashes is accepted");
  assert(!normalizePhone("", "3001234567", "mobile number").ok, "no country code chosen → refused");
  assert(!normalizePhone("ZZ", "3001234567", "mobile number").ok, "a country that is not in the list → refused");
  assert(!normalizePhone("PK", "", "mobile number").ok, "empty number → refused");
  assert(!normalizePhone("PK", "12", "mobile number").ok, "too short → refused");
  assert(!normalizePhone("PK", "30012345678901234", "mobile number").ok, "longer than E.164 allows → refused");
  assert(!normalizePhone("PK", "+92 300 1234567", "mobile number").ok, "a second country code typed into the number → refused (the picker supplies it)");
  assert(!normalizePhone("PK", "call me", "mobile number").ok, "letters → refused");
}

section("B. Upwork profile link");
{
  const bare = normalizeUpworkLink("www.upwork.com/freelancers/~01abc");
  assert(bare.ok && bare.value === "https://www.upwork.com/freelancers/~01abc", "a link pasted without https:// is accepted and stored WITH the scheme");
  assert(normalizeUpworkLink("https://www.upwork.com/agencies/1234567890/").ok, "an agency profile is accepted");
  assert(normalizeUpworkLink("https://upwork.com/fl/someone").ok, "the short /fl/ form is accepted");
  assert(!normalizeUpworkLink("").ok, "empty → refused (the field is mandatory)");
  assert(!normalizeUpworkLink("http://www.upwork.com/freelancers/~01abc").ok, "plain http → refused");
  assert(!normalizeUpworkLink("https://www.upwork.com/").ok, "the Upwork home page is not a profile → refused");
  assert(!normalizeUpworkLink("https://evil.example/freelancers/~01abc").ok, "another site → refused");
  assert(!normalizeUpworkLink("https://www.upwork.com.evil.example/freelancers/x").ok, "a look-alike host → refused");
  assert(!normalizeUpworkLink("javascript:alert(1)").ok, "javascript: → refused");
}

section("C. Every field is mandatory — enforced without a browser");
{
  assert(validateLead(good()).ok, "a complete enquiry is accepted");
  for (const [key, field] of [["name", "name"], ["email", "email"], ["mobileNumber", "mobile"], ["mobileCountry", "mobile"], ["whatsappNumber", "whatsapp"], ["whatsappCountry", "whatsapp"], ["profileLink", "profileLink"], ["goals", "goals"]] as const) {
    assert(fieldsOf({ ...good(), [key]: "" })[field], `blank ${key} → refused, with a message on "${field}"`);
  }
  assert(fieldsOf({ ...good(), consent: false }).consent, "consent not given → refused");
  assert(fieldsOf({ ...good(), goals: "help" }).goals, "a one-word concern → refused (too short to act on)");
  assert(fieldsOf({ ...good(), email: "not-an-email" }).email, "a malformed email → refused");
  const all = validateLead({ ...good(), name: "", email: "", mobileNumber: "", whatsappNumber: "", profileLink: "", goals: "", consent: false });
  assert(!all.ok && Object.keys(all.fields).length === 7, "an empty form reports all seven problems at once, not one at a time");
  assert(!all.ok && all.error === "7 fields above need fixing.", "…and the summary counts them");
  const { whatsappNumber: _omit, ...missingKey } = good();
  assert(!validateLead(missingKey).ok, "a request that leaves the WhatsApp field out entirely → refused");
  assert(!validateLead({ ...good(), extra: "x" }).ok, "unknown extra fields → refused");
  const ok = validateLead({ ...good(), whatsappCountry: "AE", whatsappNumber: "50 123 4567" });
  assert(ok.ok && ok.lead.mobile === "+92 3001234567" && ok.lead.whatsapp === "+971 501234567", "a WhatsApp number in a different country from the mobile is kept separately");
  assert(ok.ok && ok.lead.country === "PK", "country is taken from the mobile number's picker");
  assert(ok.ok && ok.lead.email === "ayesha@example.com", "email is lower-cased");
  const offsite = validateLead({ ...good(), sourcePage: "https://evil.example/x" });
  assert(offsite.ok && offsite.lead.sourcePage === "", "a sourcePage that is not a path on this site is dropped, not stored");
}

section("D. Storage (real Postgres)");
{
  const sql = postgres(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const input = { ...good(), email: `lead-${randomUUID().slice(0, 8)}@example.com`, source: "landing_location" as const, sourcePage: "/upwork-bidding-agency/pakistan/lahore" };
  const first = await saveLead(input, null);
  assert(first.status === 201 && first.body.reference === input.submissionId, "a valid enquiry is saved (201) and returns its reference");
  const [row] = await sql`select name, email, mobile, whatsapp, country, profile_link, goals, source, source_page, status from leads where id = ${input.submissionId}`;
  assert(row?.mobile === "+92 3001234567" && row?.whatsapp === "+92 3001234567", "mobile and WhatsApp are stored in +<code> <number> form");
  assert(row?.country === "PK" && row?.source === "landing_location" && row?.source_page === "/upwork-bidding-agency/pakistan/lahore", "country, source and the page it came from are stored");
  assert(row?.profile_link === "https://www.upwork.com/freelancers/~01abcdef" && row?.status === "new", "the profile link is stored and the enquiry starts as 'new'");
  const again = await saveLead(input, null);
  assert(again.status === 200, "submitting the same form twice (double-click, retry) does not create a second enquiry");
  const [{ n }] = await sql`select count(*)::int n from leads where email = ${input.email}`;
  assert(n === 1, "…exactly one row exists");
  const bad = await saveLead({ ...good(), mobileNumber: "" }, null);
  assert(bad.status === 400 && bad.body.fields?.mobile, "an enquiry with no mobile number is rejected with 400 and writes nothing");
  const bot = await saveLead({ ...good(), website: "http://spam.example" }, null);
  assert(bot.status === 400, "the honeypot still rejects bots");
  for (let i = 0; i < 4; i++) await saveLead({ ...input, submissionId: randomUUID() }, null);
  const sixth = await saveLead({ ...input, submissionId: randomUUID() }, null);
  assert(sixth.status === 429, "a sixth enquiry from one email in a day is rate-limited");
  await sql`delete from leads where email = ${input.email}`;

  // The abuse gate: consulted only for a valid, new submission, and able to refuse it.
  let asked = 0;
  const open = async () => { asked++; return { ok: true as const }; };
  const shut = async () => { asked++; return { ok: false as const, retryAfterSeconds: 600, message: "Several enquiries have already been sent from this browser." }; };
  const gated = { ...good(), email: `gate-${randomUUID().slice(0, 8)}@example.com` };
  await saveLead({ ...gated, mobileNumber: "" }, null, open);
  assert(asked === 0, "an enquiry with a field error does not use up the sender's allowance");
  const allowed = await saveLead(gated, null, open);
  assert(allowed.status === 201 && asked === 1, "a valid new enquiry is checked against the limit once, then saved");
  await saveLead(gated, null, shut);
  assert(asked === 1, "re-sending an enquiry that is already saved is not counted again");
  const refused = await saveLead({ ...gated, submissionId: randomUUID() }, null, shut);
  assert(refused.status === 429 && refused.body.retryAfterSeconds === 600 && !refused.body.reference, "when the limit is reached the enquiry is refused with 429 and a retry time");
  const [{ g }] = await sql`select count(*)::int g from leads where email = ${gated.email}`;
  assert(g === 1, "…and nothing is written for the refused one");
  await sql`delete from leads where email = ${gated.email}`;

  // The real gate, against the real throttle table: 5 per browser, then a lock; other browsers unaffected.
  const { consume } = await import("../../lib/security/email-throttle");
  const { leadRules } = await import("../../lib/security/lead-throttle");
  const rules = leadRules();
  const tag = randomUUID().slice(0, 8);
  const buckets = (browser: string) => [{ key: `lead:ip:test-${tag}`, rule: rules.ip }, { key: `lead:browser:${browser}-${tag}`, rule: rules.browser }];
  let accepted = 0;
  for (let i = 0; i < 7; i++) if ((await consume(buckets("A"))).ok) accepted++;
  assert(rules.browser.limit === 5 && accepted === 5, "one browser can send 5 enquiries in an hour; the 6th and 7th are refused");
  assert((await consume(buckets("B"))).ok, "a different browser on the same network is not locked out by the first");
  await sql`delete from auth_email_throttle where bucket like ${`lead:%${tag}`}`;
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
