// Regression test for the 13 Oct 2026 production failure: Claude wrote a descriptive phrase into
// profile.jobs ("5 total jobs, 4 completed and 1 in progress"), the 40-character limit rejected
// it twice, and the customer saw "The AI returned an incomplete audit after a retry".
// Run: npx tsx scripts/local-tests/audit-schema-tolerance.local-test.mts
import assert from "node:assert/strict";
import { auditReportSchema, normalizeJobs, normalizeJss, fitText } from "../../lib/audit-report";
import { sampleAuditReport } from "../../lib/audit-preview";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`ok - ${name}`); };
const { generatedAt: _g, provider: _p, source: _s, ...base } = sampleAuditReport as typeof sampleAuditReport & Record<string, unknown>;

check("the untouched sample report still validates", () => {
  assert.equal(auditReportSchema.safeParse(base).success, true);
});

check("the exact production failure now validates and keeps the number", () => {
  const r = auditReportSchema.safeParse({ ...base, profile: { ...base.profile, jobs: "5 total jobs, 4 completed and 1 in progress" } });
  assert.equal(r.success, true, JSON.stringify(!r.success && r.error.issues));
  assert.equal(r.success && r.data.profile.jobs, "5");
});

check("long JSS phrase reduces to the percentage", () => {
  const r = auditReportSchema.safeParse({ ...base, profile: { ...base.profile, jss: "98% Job Success Score, Top Rated Plus badge visible" } });
  assert.equal(r.success && r.data.profile.jss, "98%");
});

check("JSS text with no percentage is fitted, never rejected", () => {
  const r = auditReportSchema.safeParse({ ...base, profile: { ...base.profile, jss: "Not shown on the profile because the freelancer is new to Upwork" } });
  assert.equal(r.success, true);
  assert.ok(r.success && r.data.profile.jss.length <= 40);
});

check("over-long name/title/rate are fitted at a word boundary with an ellipsis", () => {
  const long = "word ".repeat(80);
  const r = auditReportSchema.safeParse({ ...base, profile: { ...base.profile, name: long, title: long, rate: long } });
  assert.equal(r.success, true);
  if (r.success) {
    assert.ok(r.data.profile.name.length <= 120 && r.data.profile.name.endsWith("…"));
    assert.ok(!/\s…$/.test(r.data.profile.title));
    assert.ok(r.data.profile.rate.length <= 80);
  }
});

check("plain numeric and empty values pass through unchanged", () => {
  assert.equal(normalizeJobs("5"), "5");
  assert.equal(normalizeJobs("1,204"), "1,204");
  assert.equal(normalizeJobs(""), "");
  assert.equal(normalizeJss("100%"), "100%");
  assert.equal(normalizeJss(""), "");
  assert.equal(fitText("  short   text ", 40), "short text");
});

check("judgement fields are still strict: a missing finding still fails", () => {
  const r = auditReportSchema.safeParse({ ...base, findings: base.findings.slice(1) });
  assert.equal(r.success, false);
});

check("judgement fields are still strict: a too-short executive summary still fails", () => {
  const r = auditReportSchema.safeParse({ ...base, executiveSummary: "Too short." });
  assert.equal(r.success, false);
});

console.log(`\n${passed} assertions passed`);
