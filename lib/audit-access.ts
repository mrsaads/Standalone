import type { AuditReport } from "./audit-report";
import type { CriterionId } from "./audit-report";
import { canonicalOrder, sections, summarize, type AuditSection, type Finding } from "./audit-preview";

// ------------------------------------------------------------------------------------------------
// WHAT A FREE ACCOUNT ACTUALLY RECEIVES
// ------------------------------------------------------------------------------------------------
// A free account sees one finding from each of the eight profile areas — 8 of the 23 criteria — plus
// its score, its pass/weak/fail counts and the name of its single biggest flaw. Everything else is
// withheld.
//
// WITHHELD MEANS WITHHELD. This function runs on the server and deletes the locked content from the
// object before it is serialized. The blur in the browser is decoration over placeholder text that
// was generated in the browser; it is not the mechanism and it is not load-bearing.
//
// That distinction is the whole point of this file. A paywall implemented as `filter: blur(6px)` is
// not a paywall: the full report is in the page's JSON, in the network tab, and in `view-source`.
// Anyone who opens developer tools — or simply reads the response — has the entire paid product.
// The same reasoning already governs PDF/Word export (refused with a 403 in
// app/api/audits/[id]/export/route.ts) and the AI optimization section (blanked in both audit API
// routes), and this extends it to the findings themselves.
//
// It is applied in BOTH places a report reaches a browser:
//   - app/api/audits/route.ts            — a freshly generated audit
//   - app/api/audits/[id]/route.ts       — reopening a saved one, including from the "audit ready"
//                                          email's ?openAudit= link
// Miss either and the paywall has a hole with a permanent URL in somebody's inbox.
// ------------------------------------------------------------------------------------------------

/**
 * How many findings from each section a free account sees.
 *
 * One per section gives 8 of 23 (≈35%). That is a little over the 30% target on purpose: there are
 * eight profile areas, and showing one from each is what makes the free report legible as an audit
 * of a whole profile rather than a deep look at one corner of it. Dropping to 7 would silently
 * exclude a whole area, and the reader would not know which.
 */
export const FREE_FINDINGS_PER_SECTION = 1;

/**
 * Which finding within a section is the free one: the first in the fixed 23-criterion order.
 *
 * Deterministic and neutral, which matters for two reasons. It is explainable to a customer ("you
 * see the first criterion of each area"), and it does not systematically hand over the eight most
 * valuable fixes — picking the WORST finding per section would show a free user exactly what is
 * broken and exactly how to fix it, in every area, which is the paid product.
 *
 * To change the rule to "the most severe in each section", sort by status here (fail, weak, pass,
 * nv) before taking the first. Nothing else needs to change.
 */
function pickVisible(findings: Finding[]): Finding[] {
  const ordered = canonicalOrder(findings);
  const visible: Finding[] = [];
  for (const section of sections) {
    const inSection = ordered.filter(f => f.section === section.id);
    visible.push(...inSection.slice(0, FREE_FINDINGS_PER_SECTION));
  }
  // A finding whose section is not one of the eight known ones would otherwise vanish entirely
  // rather than being locked, so it is treated as locked by falling through to the caller's diff.
  return visible;
}

/** The stub that stands in for a locked finding. Carries no title, no status, no text. */
export type LockedFinding = {
  id: CriterionId;
  section: AuditSection;
  /** Its position in the fixed 23-point order, so the UI can say "criterion 12" without naming it. */
  index: number;
};

export type ScoreSummary = ReturnType<typeof summarize>;

export type AuditAccess = {
  /** True when this payload has been redacted. The UI must not infer this from the plan. */
  locked: boolean;
  visibleFindings: number;
  totalFindings: number;
  /** One stub per withheld criterion — id, section and number only. */
  lockedFindings: LockedFinding[];
  /**
   * Computed on the server from the COMPLETE finding set before redaction.
   *
   * It has to be, because the client can only see 8 findings and `summarize()` over 8 findings would
   * report "3 / 8 assessed points" — a different, wrong score. The free account is told the truth
   * about its whole profile; it is simply not told which criteria produced it.
   */
  score: ScoreSummary;
};

/** What a paying account gets: everything, with the access block filled in honestly. */
export function fullAccess(report: AuditReport): AuditAccess {
  return {
    locked: false,
    visibleFindings: report.findings.length,
    totalFindings: report.findings.length,
    lockedFindings: [],
    score: summarize(report.findings as Finding[]),
  };
}

/**
 * Strips a report down to what a free account may receive.
 *
 * Kept: the profile details, the score and its counts, the name of the biggest flaw, the single
 * opportunity headline, the methodology, and one finding per section in full.
 *
 * Removed: the executive summary, why the biggest flaw comes first, what is already working, the
 * opportunity's detail, the whole action plan, the AI-written headline and overview, the keyword
 * recommendations and the research notes — plus every locked finding's title, status, note,
 * evidence and recommended action.
 *
 * `biggestFlaw` and `opportunity.title` stay deliberately: a free report with no hook is not a lead
 * magnet, it is just a locked door. Naming the problem without explaining it is the offer.
 */
export function redactForFreeAccount(report: AuditReport): { audit: AuditReport; access: AuditAccess } {
  const all = report.findings as Finding[];
  const score = summarize(all);
  const visible = pickVisible(all);
  const visibleIds = new Set(visible.map(f => f.id));

  const order = canonicalOrder(all);
  const lockedFindings: LockedFinding[] = order
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => !visibleIds.has(finding.id))
    .map(({ finding, index }) => ({ id: finding.id, section: finding.section, index: index + 1 }));

  const audit: AuditReport = {
    ...report,
    findings: visible as AuditReport["findings"],
    // Long-form narrative: every one of these paraphrases several locked findings in prose, so
    // leaving any of them in would hand back what the lock just took away.
    executiveSummary: "",
    whyThisComesFirst: "",
    alreadyWorking: "",
    opportunity: { title: report.opportunity.title, detail: "" },
    // The action plan is the report's most valuable page — the prioritised list of what to change.
    priorities: [],
    // Already gated before this change; repeated here so one function describes the entire free
    // payload rather than two rules in two files.
    suggestedHeadline: "",
    suggestedOverview: "",
    keywordRecommendations: [],
    researchNotes: [],
  };

  return {
    audit,
    access: {
      locked: true,
      visibleFindings: visible.length,
      totalFindings: all.length,
      lockedFindings,
      score,
    },
  };
}

/**
 * The single entry point both audit API routes call.
 *
 * Takes the decision from the entitlement rather than from anything the browser sent, and returns
 * the payload plus the access block describing it.
 */
export function applyAuditAccess(
  report: AuditReport,
  entitlement: { canOptimize: boolean; canDownload: boolean },
): { audit: AuditReport; access: AuditAccess } {
  // `canDownload` is the paid/free line — free accounts cannot export, and are also the accounts
  // whose findings are limited. Read from the resolved entitlement (lib/entitlements.ts), never
  // from a role string or a query parameter.
  if (!entitlement.canDownload) return redactForFreeAccount(report);

  // A paying account still has the optimization section governed separately, so that rule is kept
  // rather than being folded into the free/paid line.
  const audit = entitlement.canOptimize ? report : { ...report, suggestedHeadline: "", suggestedOverview: "" };
  return { audit, access: fullAccess(report) };
}

/**
 * A sample report shown to a signed-out or curious visitor is not somebody's real audit, so it is
 * never redacted — there is nothing to protect and a half-blurred example sells nothing.
 */
export function sampleAccess(report: AuditReport): AuditAccess {
  return fullAccess(report);
}
