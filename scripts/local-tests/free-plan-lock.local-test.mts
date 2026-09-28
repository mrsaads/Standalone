// LOCAL-ONLY test for the free-plan report lock.
//
// The property under test is NOT "the UI blurs the right things". It is that the locked content is
// absent from the object the server would serialize — because a blur is a CSS filter and a CSS
// filter is removed by anyone who opens developer tools. If this file ever passes while the real
// findings are still in the payload, the paywall is decorative.
//
// So most of these assertions are of the form "this string does not appear anywhere in
// JSON.stringify(payload)". That is deliberately blunt: it catches a leak through a field nobody
// thought about, including one added later.
//
// No database is needed — every function under test is pure.
//
// Usage: npx tsx scripts/local-tests/free-plan-lock.local-test.mts
import { applyAuditAccess, fullAccess, redactForFreeAccount, FREE_FINDINGS_PER_SECTION } from "../../lib/audit-access";
import { sampleAuditReport, sections, summarize, type Finding } from "../../lib/audit-preview";
import { criterionIds } from "../../lib/audit-report";
import type { AuditReport } from "../../lib/audit-report";

let pass = 0;
let fail = 0;
function assert(condition: boolean, label: string) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ FAIL: ${label}`); }
}
function section(title: string) { console.log(`\n${title}`); }

// A full 23-criterion report whose every locked string is unique and greppable, so a leak through
// any field at all shows up as that exact marker appearing in the serialized payload.
function buildReport(): AuditReport {
  const statuses = ["pass", "weak", "fail", "nv"] as const;
  const perSection = Math.ceil(criterionIds.length / sections.length);
  const findings: Finding[] = criterionIds.map((id, i) => ({
    id,
    section: sections[Math.min(sections.length - 1, Math.floor(i / perSection))].id,
    title: `TITLE_${i}`,
    status: statuses[i % statuses.length],
    note: `NOTE_${i}`,
    evidence: `EVIDENCE_${i}`,
    action: `ACTION_${i}`,
  }));

  return {
    ...sampleAuditReport,
    reportName: "Lock test",
    executiveSummary: "SECRET_EXEC_SUMMARY",
    biggestFlaw: "THE_BIGGEST_FLAW",
    whyThisComesFirst: "SECRET_WHY_FIRST",
    alreadyWorking: "SECRET_ALREADY_WORKING",
    opportunity: { title: "THE_OPPORTUNITY_TITLE", detail: "SECRET_OPPORTUNITY_DETAIL" },
    findings: findings as AuditReport["findings"],
    priorities: [
      { id: "p1", title: "SECRET_PRIORITY_ONE", detail: "SECRET_PRIORITY_ONE_DETAIL" },
      { id: "p2", title: "SECRET_PRIORITY_TWO", detail: "SECRET_PRIORITY_TWO_DETAIL" },
    ] as AuditReport["priorities"],
    suggestedHeadline: "SECRET_HEADLINE",
    suggestedOverview: "SECRET_OVERVIEW",
    keywordRecommendations: ["SECRET_KEYWORD"],
    researchNotes: [{ title: "SECRET_RESEARCH", insight: "SECRET_INSIGHT", url: "https://example.com" }] as AuditReport["researchNotes"],
  };
}

const FREE = { canDownload: false, canOptimize: false };
const SUBSCRIBER = { canDownload: true, canOptimize: true };
// A real shape: an account that may export but whose optimization section is still gated.
const DOWNLOAD_ONLY = { canDownload: true, canOptimize: false };

function main() {
  console.log("Free-plan report lock");
  const report = buildReport();
  const everything = JSON.stringify(report);

  // ============================================================================================
  section("1. How much a free account sees");
  // ============================================================================================
  const { audit: free, access } = redactForFreeAccount(report);
  const wire = JSON.stringify({ audit: free, access });

  assert(report.findings.length === 23, "the fixture is a full 23-criterion report");
  assert(access.locked === true, "the payload declares itself locked, so the UI never has to infer it from the plan");
  assert(free.findings.length === sections.length * FREE_FINDINGS_PER_SECTION,
    `${free.findings.length} findings are sent — one from each of the ${sections.length} profile areas`);
  assert(access.visibleFindings === free.findings.length && access.totalFindings === 23,
    "the access block reports the real visible/total split");
  assert(access.lockedFindings.length === 23 - free.findings.length,
    `${access.lockedFindings.length} findings are withheld`);

  const visibleSections = new Set(free.findings.map(f => f.section));
  assert(visibleSections.size === sections.length,
    "every profile area is represented, so a free user can see the audit covers their whole profile");

  const shown = free.findings.length / 23;
  assert(shown > 0.3 && shown < 0.4, `that is ${Math.round(shown * 100)}% of the 23 criteria`);

  // ============================================================================================
  section("2. The locked findings are ABSENT, not hidden");
  // ============================================================================================
  const visibleIds = new Set(free.findings.map(f => f.id));
  const lockedIndexes = report.findings
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !visibleIds.has(f.id))
    .map(({ i }) => i);

  // Every marker is matched WITH its closing JSON quote. Without it, "NOTE_1" matches inside a
  // visible finding's "NOTE_12" and the test reports a leak that is not there — which is how this
  // test failed the first time it ran.
  const leakedTitles = lockedIndexes.filter(i => wire.includes(`TITLE_${i}"`));
  const leakedNotes = lockedIndexes.filter(i => wire.includes(`NOTE_${i}"`));
  const leakedEvidence = lockedIndexes.filter(i => wire.includes(`EVIDENCE_${i}"`));
  const leakedActions = lockedIndexes.filter(i => wire.includes(`ACTION_${i}"`));

  assert(leakedTitles.length === 0, "no locked finding's TITLE appears anywhere in the serialized payload");
  assert(leakedNotes.length === 0, "no locked finding's NOTE appears anywhere in the serialized payload");
  assert(leakedEvidence.length === 0, "no locked finding's EVIDENCE appears anywhere in the serialized payload");
  assert(leakedActions.length === 0, "no locked finding's recommended ACTION appears anywhere in the serialized payload");

  const stub = access.lockedFindings[0];
  assert(Object.keys(stub).sort().join(",") === "id,index,section",
    "a locked stub carries only id, section and its number — no status, so not even pass/fail leaks");
  assert(access.lockedFindings.every(item => item.index >= 1 && item.index <= 23),
    "each stub's number is its real position in the fixed 23-point order");

  // ============================================================================================
  section("3. Everything else that is withheld");
  // ============================================================================================
  for (const [label, marker] of [
    ["the executive summary", "SECRET_EXEC_SUMMARY"],
    ["why the biggest flaw comes first", "SECRET_WHY_FIRST"],
    ["what is already working", "SECRET_ALREADY_WORKING"],
    ["the opportunity's detail", "SECRET_OPPORTUNITY_DETAIL"],
    ["the action plan", "SECRET_PRIORITY_ONE"],
    ["the action plan's detail", "SECRET_PRIORITY_ONE_DETAIL"],
    ["the AI-written headline", "SECRET_HEADLINE"],
    ["the AI-written overview", "SECRET_OVERVIEW"],
    ["the keyword recommendations", "SECRET_KEYWORD"],
    ["the research notes", "SECRET_RESEARCH"],
  ] as const) {
    assert(everything.includes(marker) && !wire.includes(marker), `${label} is removed from the payload`);
  }
  assert(free.priorities.length === 0, "the action plan array is empty, not merely hidden behind a flag");

  // ============================================================================================
  section("4. What a free account DOES keep — the hook");
  // ============================================================================================
  assert(wire.includes("THE_BIGGEST_FLAW"), "the biggest flaw is still named (without being explained)");
  assert(wire.includes("THE_OPPORTUNITY_TITLE"), "the opportunity headline is still named");
  assert(free.profile.name === report.profile.name, "their own profile details are their own data and are kept");

  const truth = summarize(report.findings as Finding[]);
  assert(access.score.total === 23 && access.score.assessed === truth.assessed && access.score.points === truth.points,
    "the score is computed from ALL 23 before redaction, so a free account is told the truth about its whole profile");
  const wrongScore = summarize(free.findings as Finding[]);
  assert(wrongScore.total !== access.score.total,
    `and it is NOT what the browser would compute from the 8 it can see (${wrongScore.points}/${wrongScore.assessed} vs ${access.score.points}/${access.score.assessed})`);

  // ============================================================================================
  section("5. Paying accounts are unaffected");
  // ============================================================================================
  const paid = applyAuditAccess(report, SUBSCRIBER);
  const paidWire = JSON.stringify(paid);
  assert(paid.access.locked === false, "a subscriber's payload is not locked");
  assert(paid.audit.findings.length === 23, "a subscriber receives all 23 findings");
  assert(paid.audit.priorities.length === 2, "and the action plan");
  assert(paidWire.includes("SECRET_EXEC_SUMMARY") && paidWire.includes("SECRET_HEADLINE"),
    "and the narrative and the AI optimization content");
  assert(paid.access.score.points === truth.points, "with the same score a free account was shown");

  const partial = applyAuditAccess(report, DOWNLOAD_ONLY);
  assert(partial.audit.findings.length === 23 && partial.access.locked === false,
    "an account that can export but not optimize still gets every finding");
  assert(!JSON.stringify(partial).includes("SECRET_HEADLINE"),
    "…while the optimization section stays gated for it, exactly as before this change");

  // ============================================================================================
  section("6. The entry point reads the entitlement, not the caller");
  // ============================================================================================
  const viaEntry = applyAuditAccess(report, FREE);
  assert(viaEntry.access.locked === true && viaEntry.audit.findings.length === free.findings.length,
    "applyAuditAccess with a free entitlement produces the same redaction as calling it directly");
  assert(JSON.stringify(viaEntry) === JSON.stringify({ audit: free, access }),
    "byte for byte — there is one redaction, not one per route");

  // The sample report is nobody's real audit; half-blurring an example sells nothing.
  assert(fullAccess(sampleAuditReport).locked === false, "the sample report is never locked");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
