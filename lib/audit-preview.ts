import { isProfileReference, type Profile } from "./audit";
import type { AuditReport } from "./audit-report";
import { criterionIds, type CriterionId } from "./audit-report";

export type FindingStatus = "pass" | "weak" | "fail" | "nv";
export type AuditSection = "fundamentals" | "title" | "overview" | "portfolio" | "skills" | "history" | "pricing" | "trust";
// id is one of the 23 approved criterion ids (lib/audit-report.ts), not a free-form string — this is what
// let the compiler catch, at the type level, a normalize() bug that would have re-slugged a validated
// criterion id into something no longer in the approved set (see app/api/audits/route.ts).
export type Finding = { id: CriterionId; section: AuditSection; title: string; status: FindingStatus; note: string; evidence: string; action?: string };
export type ProfileDetails = { name: string; title: string; niche: string; services: string; buyer: string; reportName: string; rate: string; jss: string; jobs: string; completed: string; active: string };

export const sections: { id: AuditSection; title: string; short: string }[] = [
  { id: "fundamentals", title: "Profile Fundamentals", short: "Fundamentals" }, { id: "title", title: "Title", short: "Title" },
  { id: "overview", title: "Overview", short: "Overview" }, { id: "portfolio", title: "Portfolio", short: "Portfolio" },
  { id: "skills", title: "Skills & Certifications", short: "Skills" }, { id: "history", title: "Work History & Reviews", short: "Work history" },
  { id: "pricing", title: "Pricing & Positioning", short: "Pricing" }, { id: "trust", title: "Trust & Conversion Signals", short: "Trust" },
];

// Sorts by the 23-criterion registry order first (lib/audit-report.ts), so numbering is fixed by
// criterion identity, not by whatever order the AI happened to return items in. Falls back to
// section-then-arrival order only for an item whose id isn't one of the 23 approved ids — real audit
// data can no longer reach this function in that state (the schema rejects it first), but sample/legacy
// callers with a plain `Finding` shape still go through the same function.
export function canonicalOrder<T extends { id: string; section: AuditSection }>(items: T[]): T[] {
  const sectionOrder = sections.map(item => item.id);
  const idOrder = criterionIds as readonly string[];
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ai = idOrder.indexOf(a.item.id), bi = idOrder.indexOf(b.item.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return sectionOrder.indexOf(a.item.section) - sectionOrder.indexOf(b.item.section) || a.index - b.index;
    })
    .map(({ item }) => item);
}

// One scoring rule, one place to read it from. Used by both the PDF and DOCX exporters (and should be
// used by any future renderer) so a report never displays two different scoring presentations.
export function scoreHeadline(score: ReturnType<typeof summarize>): string {
  if (score.assessed === 0) return "Insufficient evidence to score";
  const points = Number.isInteger(score.points) ? String(score.points) : score.points.toFixed(1);
  return `${points} / ${score.assessed} assessed points`;
}

export function scoreDetail(score: ReturnType<typeof summarize>): string {
  const breakdown = `${score.pass} Pass · ${score.weak} Weak · ${score.fail} Fail`;
  if (!score.nv) return breakdown;
  const unverified = `${score.nv} of ${score.total} criteria not verified`;
  return score.assessed === 0 ? unverified : `${breakdown} · ${unverified}`;
}

export const emptyDetails: ProfileDetails = { name: "", title: "", niche: "", services: "", buyer: "", reportName: "Upwork Profile Audit", rate: "", jss: "", jobs: "", completed: "", active: "" };
export const sampleDetails: ProfileDetails = {
  name: "Jawad A.", title: "Microsoft Dynamics 365 Consultant | Power Platform | Dataverse", niche: "Microsoft Dynamics 365 & Power Platform",
  services: "CRM customization, Power Apps, automation, integrations, and data migration", buyer: "Businesses using Microsoft Dynamics 365", reportName: "Jawad A. — Upwork Profile Audit",
  rate: "$20/hr", jss: "92%", jobs: "32", completed: "31", active: "1",
};

export const sampleFindings: Finding[] = [
  { id: "photo", section: "fundamentals", title: "Profile photo is polished and professional", status: "weak", note: "The profile photo needs improvement to match the strength of the technical positioning.", evidence: "The supplied audit notes flag the profile photo for improvement.", action: "Use a sharp, well-lit headshot with a simple background and confident framing." },
  { id: "video", section: "fundamentals", title: "Introduction video", status: "weak", note: "An introduction video is reported missing. A concise introduction could explain the service and approach.", evidence: "The supplied notes state: no video introduction.", action: "Record a short introduction around your main service, relevant proof, and next step." },
  { id: "record", section: "fundamentals", title: "Track record is visible", status: "pass", note: "The supplied profile makes its work history and platform metrics easy to identify.", evidence: "92% Job Success, 32 total jobs, $6K+ earned, and 396 hours are listed." },
  { id: "location", section: "fundamentals", title: "Location and time zone are shown clearly", status: "pass", note: "The profile clearly shows the freelancer's location and local time.", evidence: "Swabi, Pakistan and local time are visible on the supplied profile." },
  { id: "badges", section: "fundamentals", title: "Status badges are consistent", status: "weak", note: "A New badge appears beside an established work record and should be checked.", evidence: "The profile shows a New badge alongside 92% Job Success, 32 jobs and $6K+ earned.", action: "Check whether the badge is attached to a new specialized profile or catalog item." },
  { id: "headline", section: "title", title: "A clear, specific headline", status: "pass", note: "A buyer can identify the main consulting specialty directly from the title.", evidence: "The headline names Microsoft Dynamics 365, Power Platform, and Dataverse." },
  { id: "niche", section: "title", title: "The niche matches supplied work", status: "pass", note: "The advertised platforms appear repeatedly in the detailed job entries.", evidence: "Supplied jobs include Dynamics customization, Dataverse integration, and Power Automate workflows." },
  { id: "outcome", section: "overview", title: "Business value is explained", status: "pass", note: "The opening connects the technical services to daily operations and reduced manual work.", evidence: "The overview discusses improving operations, automating repetitive work, and supporting business growth." },
  { id: "scan", section: "overview", title: "Two service lists repeat the offer", status: "weak", note: "Overlapping lists make the overview longer to scan than it needs to be.", evidence: "The expertise and additional-services lists both cover customization, automation, and integrations.", action: "Group the repeated items into four or five distinct service areas." },
  { id: "next", section: "overview", title: "A clear next step", status: "pass", note: "The ending invites a project discussion and an approach recommendation.", evidence: "The final paragraph invites the client to discuss the project and the best approach." },
  { id: "cases", section: "portfolio", title: "Sufficient number of pieces shown", status: "weak", note: "Four portfolio pieces are below the benchmark for an established specialist.", evidence: "The supplied profile contains four portfolio pieces.", action: "Add two to four focused case studies showing problem, implementation and result." },
  { id: "thumbs", section: "portfolio", title: "Thumbnails are visually polished", status: "weak", note: "The thumbnails need stronger, more consistent presentation.", evidence: "Portfolio thumbnail improvement is explicitly flagged in the supplied audit notes.", action: "Apply consistent colour grading, typography and service-led thumbnail titles." },
  { id: "tags", section: "skills", title: "Skills support the core offer", status: "pass", note: "The 20 listed skill tags largely align with the Microsoft CRM and automation offer.", evidence: "The Skills section contains 20 entries, including Dynamics CRM, PowerApps, Power Automate, SharePoint, C#, and Azure." },
  { id: "certificates", section: "skills", title: "Certifications are from recognized providers", status: "pass", note: "Both certifications are genuine Microsoft credentials with verification links.", evidence: "Two Microsoft-issued certifications and their verification links appear in the supplied source." },
  { id: "reviews", section: "history", title: "Supplied reviews are consistently positive", status: "pass", note: "All ten detailed job entries show 5.0 ratings, with specific praise for the work.", evidence: "The ten supplied completed jobs include CRM development, Copilot agents, automation, and integrations." },
  { id: "coverage", section: "history", title: "Job Success Score matches visible reviews", status: "weak", note: "The 92% score is slightly below the perfect visible review record and deserves a quick check.", evidence: "Ten visible completed jobs are rated 5.0 while Job Success is 92%.", action: "Review Upwork's private JSS insights for an unlisted or private factor." },
  { id: "consultation", section: "pricing", title: "Consultation price is understandable", status: "pass", note: "A $20 consultation lasting 30 minutes is equivalent to $40/hour. This can be an intentional premium.", evidence: "The listed hourly rate is $20; the consultation is $20 per 30 minutes." },
  { id: "catalog", section: "pricing", title: "Project Catalog pricing matches the positioning", status: "fail", note: "Two $10 offers materially undercut the enterprise-level service positioning.", evidence: "Both Project Catalog offers are listed at $10.", action: "Raise starter pricing and define a narrow entry deliverable that leads into larger work." },
  { id: "market", section: "pricing", title: "Hourly rate is supported by the record", status: "pass", note: "The $20 hourly rate is credible against the supplied reviews and long-term engagement.", evidence: "The profile shows consistent 5.0 reviews and an engagement worth more than $1,600." },
  { id: "catalog-visual", section: "pricing", title: "Catalog visual presentation is polished", status: "fail", note: "Catalog thumbnails do not yet match the professionalism of the service record.", evidence: "The supplied audit explicitly flags catalog colour grading and presentation.", action: "Rebuild both catalog covers with consistent branding and enterprise-focused messaging." },
  { id: "employment", section: "trust", title: "Employment history is clearly explained", status: "weak", note: "Two consulting roles appear ongoing at the same time and would benefit from one line of context.", evidence: "Dynamics Consulting GmbH and Maison Consulting and Solutions both end in Present.", action: "Clarify whether the roles are concurrent contracts, part-time positions or one has ended." },
  { id: "identity", section: "trust", title: "An ID verification indicator is listed", status: "pass", note: "The supplied profile text includes the ID verification indicator.", evidence: "The Verifications section lists “ID: Verified”. This is a source observation, not an independent identity check." },
  { id: "jss", section: "trust", title: "Visitors can trust the freelancer quickly", status: "pass", note: "Focused positioning, Microsoft credentials and consistent reviews establish trust quickly.", evidence: "The profile combines a clear title, two verified Microsoft credentials and ten visible 5.0 reviews." },
];

export const priorityFixes = [
  { id: "pricing", title: "Raise the Project Catalog pricing", detail: "Replace the $10 positioning with a credible starter scope that supports enterprise-level work." },
  { id: "catalog-visual", title: "Improve the catalog thumbnails", detail: "Use consistent colour grading and clearer service-led cover titles." },
  { id: "overview", title: "Make the overview easier to scan", detail: "Combine overlapping lists into distinct service groups, keeping business value near the top." },
  { id: "video", title: "Add a focused introduction video", detail: "Explain who you help, the work you handle, and one relevant example of your approach." },
  { id: "portfolio", title: "Provide the missing visual evidence", detail: "Collect the full-size photo and portfolio thumbnails before deciding which visuals need changing." },
  { id: "catalog", title: "Clarify the catalog packages", detail: "Show what the starting price covers, including deliverables, limits, and revisions." },
  { id: "employment", title: "Clarify the concurrent consulting roles", detail: "Add one line explaining how both ongoing roles fit together." },
];
export const suggestedOpening = "I help businesses customize and automate Microsoft Dynamics 365 so their teams spend less time on manual work. My services include Power Apps, Dataverse, Power Automate workflows, and integrations with SharePoint and other business systems.";
export const reportSnapshot = "This is a genuinely strong profile. Every visible review is 5.0, both certifications are issued by Microsoft, and the skill tags are specific and on topic. The main weaknesses are presentation and pricing: the two $10 Project Catalog offers undercut the enterprise-level positioning, while the catalog and portfolio visuals need stronger consistency.";

export const sampleAuditReport: AuditReport = {
  reportName: sampleDetails.reportName,
  profile: {
    name: sampleDetails.name,
    title: sampleDetails.title,
    niche: sampleDetails.niche,
    services: sampleDetails.services,
    buyer: sampleDetails.buyer,
    rate: sampleDetails.rate,
    jss: sampleDetails.jss,
    jobs: sampleDetails.jobs,
  },
  executiveSummary: reportSnapshot,
  biggestFlaw: "Both Project Catalog offers are priced at just $10, undercutting an otherwise enterprise-level profile.",
  whyThisComesFirst: "A $10 flat fee next to genuine Microsoft Dynamics 365 expertise sends a mixed signal and can attract small, mismatched projects instead of enterprise work.",
  alreadyWorking: "Every visible review is 5.0, the skills are specific, both certifications are Microsoft-issued, and the title communicates a credible specialist niche.",
  opportunity: {
    title: "Make your expertise easier to understand.",
    detail: "Keep the clear niche. Shorten the overview and strengthen the evidence behind your presentation.",
  },
  findings: sampleFindings.map(finding => ({ ...finding, action: finding.action ?? "" })),
  priorities: priorityFixes,
  suggestedHeadline: sampleDetails.title,
  suggestedOverview: suggestedOpening,
  keywordRecommendations: ["Microsoft Dynamics 365", "Power Platform", "Dataverse", "Power Apps", "Power Automate", "CRM customization"],
  researchNotes: [],
  methodology: "Partial assessment of supplied example evidence. Unverified checks are excluded from scoring. The report does not predict platform ranking, earnings, replies, or client wins.",
  generatedAt: "2026-08-01T00:00:00.000Z",
  provider: "Supplied example",
  source: "sample",
};

export function summarize(findings: Finding[]) { const counts = { pass: 0, weak: 0, fail: 0, nv: 0 }; findings.forEach(f => counts[f.status]++); const assessed = counts.pass + counts.weak + counts.fail; return { ...counts, assessed, total: findings.length, points: counts.pass + counts.weak * .5, percent: assessed ? Math.round((counts.pass + counts.weak * .5) / assessed * 100) : null }; }
const profileLabels = /^(?:status|verified|available now|meet\b|hours per week|languages|verifications|education|linked accounts|work history|portfolio|skills|project catalog|testimonials|certifications|employment history|other experiences|more|less|new|avg\. response)/i;
const auditNote = /^(?:improve|need|needs|have |has |no |create |front showcase|portfolio:|there are\b)/i;

function inferPositioning(title: string) {
  const value = title.toLowerCase();
  if (/(copywriter|copywriting|seo|aeo|content)/.test(value)) return { niche: "SEO, AEO & conversion copywriting", services: "SEO content, website copy, landing pages, ecommerce copy, email copy and content strategy", buyer: "SaaS and ecommerce brands" };
  if (/(ai|llm|rag|chatbot|agent)/.test(value) && /(full.?stack|backend|python|django|fastapi)/.test(value)) return { niche: "AI applications & full-stack development", services: "AI agents, RAG systems, LLM integrations, APIs, automation and full-stack applications", buyer: "Startups and businesses building AI-powered products" };
  if (/(backend|python|django|fastapi)/.test(value)) return { niche: "Python backend development", services: "Backend architecture, REST APIs, databases, integrations, performance optimization and deployment", buyer: "Startups and product teams" };
  return { niche: "", services: "", buyer: "" };
}

export function extractBasicDetails(raw: string): ProfileDetails {
  const lines = raw.split(/\r?\n/).map(s => s.replace(/\u00a0/g, " ").trim()).filter(Boolean);
  const verifiedIndex = lines.findIndex(line => /^Verified$/i.test(line));
  const nameCandidates = lines.map((line, index) => ({ line, index })).filter(({ line, index }) =>
    /^[\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]*)+\.?$/u.test(line) &&
    line.length <= 80 && !profileLabels.test(line) && !auditNote.test(line) &&
    !/(university|college|developer|engineer|copywriter|specialist|consultant|manager|designer|studio|agency)/i.test(line)
  );
  const name = (verifiedIndex > 0 ? nameCandidates.find(candidate => candidate.index === verifiedIndex - 1)?.line : "") ||
    nameCandidates.find(candidate => /^Meet\s+/i.test(lines[candidate.index - 1] || ""))?.line || "";
  const rateIndex = lines.findIndex(line => /^\$[\d,.]+\s*\/\s*hr\b/i.test(line));
  const title = rateIndex > 0 && lines[rateIndex - 1].length <= 220 && !profileLabels.test(lines[rateIndex - 1])
    ? lines[rateIndex - 1]
    : lines.find(line => line.includes("|") && line.length < 220 && !auditNote.test(line)) ?? "";
  const rate = raw.match(/\$[\d,.]+\s*\/\s*hr\b/i)?.[0] ?? "";
  const jss = raw.match(/(\d{1,3})%\s*Job Success/i)?.[1];
  const jobs = raw.match(/(\d[\d,]*)\s*Total jobs/i)?.[1]?.replace(/,/g, "") ?? "";
  const completed = raw.match(/Completed jobs\s*\((\d+)\)/i)?.[1] ?? "";
  const active = raw.match(/In progress\s*\((\d+)\)/i)?.[1] ?? "";
  const positioning = inferPositioning(title);
  return { ...emptyDetails, ...positioning, name, title, rate, jss: jss ? `${jss}%` : "", jobs, completed, active, reportName: name ? `${name} — Upwork Profile Audit` : "Upwork Profile Audit" };
}
export function referenceValid(url: string) { return isProfileReference(url, "upwork"); }
export function makeEnquiryProfile(details: ProfileDetails, raw: string, url: string): Profile { return { platform: "upwork", profileName: details.name.slice(0, 100), profileUrl: referenceValid(url) ? url : "", service: (details.services || details.niche || details.title || "Upwork profile review").slice(0, 120), buyer: (details.buyer || "Clients for my freelance services").slice(0, 120), outcome: "", history: "starting", headline: details.title.slice(0, 300), about: raw.slice(0, 6000), answers: { offer: -1, proof: -1, buyer: -1, trust: -1, next: -1, platform: -1 } }; }
