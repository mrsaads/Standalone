import { z } from "zod";

export const auditSectionIds = ["fundamentals", "title", "overview", "portfolio", "skills", "history", "pricing", "trust"] as const;
export const auditStatuses = ["pass", "weak", "fail", "nv"] as const;

// The 23 approved criteria. This registry is the single source of truth for what a report is allowed to
// contain: it drives the AI prompt (app/api/audits/route.ts), the schema validation below, and the
// canonical ordering/numbering used by every renderer (lib/audit-preview.ts, lib/sample-report.ts). See
// docs/audit-report-template.md. If the rubric ever changes, this is the one place to change it.
export const criterionRegistry = [
  { id: "photo", section: "fundamentals", criterion: "Profile photo is polished, professional, and appropriate for the platform." },
  { id: "video", section: "fundamentals", criterion: "An introduction video is present and adds value." },
  { id: "record", section: "fundamentals", criterion: "Profile completeness and visible track record (JSS, reviews, jobs, hours) are easy to find." },
  { id: "location", section: "fundamentals", criterion: "Location and time zone are shown clearly." },
  { id: "badges", section: "fundamentals", criterion: "Status badges are internally consistent with each other and with the rest of the profile." },
  { id: "headline", section: "title", criterion: "The headline or title is clear and specific about the service offered." },
  { id: "niche", section: "title", criterion: "The advertised niche is credible and matches the supplied work history." },
  { id: "outcome", section: "overview", criterion: "The overview explains business value or outcome, not just a list of tasks." },
  { id: "scan", section: "overview", criterion: "The overview is well formatted and easy to scan quickly." },
  { id: "next", section: "overview", criterion: "The overview ends with a clear, specific next step for the buyer." },
  { id: "cases", section: "portfolio", criterion: "A sufficient number of relevant portfolio pieces are shown." },
  { id: "thumbs", section: "portfolio", criterion: "Portfolio thumbnails are visually polished and professional." },
  { id: "tags", section: "skills", criterion: "Skill tags are specific and support the core offer." },
  { id: "certificates", section: "skills", criterion: "Certifications are from recognized, independently verifiable providers." },
  { id: "reviews", section: "history", criterion: "Supplied reviews are consistently positive and specific, where visible." },
  { id: "coverage", section: "history", criterion: "Job Success Score is consistent with the visible review record." },
  { id: "consultation", section: "pricing", criterion: "Consultation pricing, where offered, is logically consistent with the hourly rate." },
  { id: "catalog", section: "pricing", criterion: "Project Catalog pricing, where offered, matches the profile's positioning." },
  { id: "market", section: "pricing", criterion: "The hourly rate is credible and supported by the track record." },
  { id: "catalog-visual", section: "pricing", criterion: "Project Catalog visual presentation, where offered, is polished." },
  { id: "employment", section: "trust", criterion: "Employment history is clearly explained, with no unexplained overlaps." },
  { id: "identity", section: "trust", criterion: "Identity and/or payment verification indicators are present." },
  { id: "jss", section: "trust", criterion: "A first-time visitor would trust this freelancer within about ten seconds." },
] as const satisfies readonly { id: string; section: typeof auditSectionIds[number]; criterion: string }[];

export const criterionIds = criterionRegistry.map(item => item.id) as [typeof criterionRegistry[number]["id"], ...typeof criterionRegistry[number]["id"][]];
export type CriterionId = typeof criterionIds[number];
export const criterionSection: Record<CriterionId, typeof auditSectionIds[number]> = Object.fromEntries(criterionRegistry.map(item => [item.id, item.section])) as Record<CriterionId, typeof auditSectionIds[number]>;

export const auditFindingSchema = z.object({
  id: z.enum(criterionIds),
  section: z.enum(auditSectionIds),
  title: z.string().min(3).max(140),
  status: z.enum(auditStatuses),
  note: z.string().min(10).max(900),
  evidence: z.string().min(3).max(900),
  action: z.string().max(900),
}).strict();

// Every one of the 23 approved ids must appear exactly once, in its registered section. This is what
// makes "sort by canonical order" meaningful — sorting can only fix ordering, not a missing, duplicated,
// or mis-sectioned criterion, so that has to be validated here, before any sorting or rendering happens.
function validateFindingSet(findings: { id: CriterionId; section: typeof auditSectionIds[number] }[], ctx: z.RefinementCtx) {
  const seenAt = new Map<CriterionId, number>();
  findings.forEach((finding, index) => {
    if (criterionSection[finding.id] !== finding.section) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "section"], message: `Finding "${finding.id}" must be in the "${criterionSection[finding.id]}" section, not "${finding.section}".` });
    }
    if (seenAt.has(finding.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: `Duplicate finding id "${finding.id}"; each of the 23 approved criteria must appear exactly once.` });
    }
    seenAt.set(finding.id, index);
  });
  for (const id of criterionIds) {
    if (!seenAt.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["findings"], message: `Missing required finding "${id}" (${criterionSection[id]}).` });
  }
}

// The profile block is identity/display metadata (the PDF prints it as "Track Record: 98% Job
// Success, 5 jobs"), not audit judgement. A model that writes "5 total jobs, 4 completed and 1 in
// progress" for `jobs` used to fail the WHOLE audit on a 40-character limit — twice, after the
// retry — throwing away a fully paid-for report over a label. So these fields are normalized
// instead of rejected: whitespace collapsed, jobs/JSS reduced to the number the renderers expect
// when one is present, anything still too long cut at a word boundary. The findings, summary and
// every other judgement field stay strictly validated below.
export const profileFieldLimits = { name: 120, title: 240, niche: 180, services: 500, buyer: 240, rate: 80, jss: 40, jobs: 40 } as const;

export function fitText(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.(-]+$/, "")}…`;
}

export function normalizeJobs(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || /^\d[\d,]*$/.test(clean)) return clean;
  // "5 total jobs, 4 completed" / "Total jobs: 5" -> "5". The renderers append the word "jobs".
  const number = clean.match(/\d[\d,]*/);
  return number ? number[0] : fitText(clean, profileFieldLimits.jobs);
}

export function normalizeJss(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 6) return clean;
  // "98% Job Success Score (Top Rated)" -> "98%". The renderers append "Job Success".
  const percent = clean.match(/\d{1,3}\s?%/);
  return percent ? percent[0].replace(/\s/, "") : fitText(clean, profileFieldLimits.jss);
}

const fitted = (max: number, normalize?: (value: string) => string) =>
  z.preprocess(value => (typeof value === "string" ? fitText(normalize ? normalize(value) : value, max) : value), z.string().max(max));

export const auditReportSchema = z.object({
  reportName: fitted(160).pipe(z.string().min(3)),
  profile: z.object({
    name: fitted(profileFieldLimits.name),
    title: fitted(profileFieldLimits.title),
    niche: fitted(profileFieldLimits.niche),
    services: fitted(profileFieldLimits.services),
    buyer: fitted(profileFieldLimits.buyer),
    rate: fitted(profileFieldLimits.rate),
    jss: fitted(profileFieldLimits.jss, normalizeJss),
    jobs: fitted(profileFieldLimits.jobs, normalizeJobs),
  }).strict(),
  executiveSummary: z.string().min(40).max(1800),
  biggestFlaw: z.string().min(10).max(500),
  whyThisComesFirst: z.string().min(30).max(1000),
  alreadyWorking: z.string().min(30).max(1000),
  opportunity: z.object({
    title: z.string().min(5).max(180),
    detail: z.string().min(20).max(900),
  }).strict(),
  findings: z.array(auditFindingSchema).length(23).superRefine(validateFindingSet),
  priorities: z.array(z.object({
    id: z.string().min(1).max(80),
    title: z.string().min(3).max(160),
    detail: z.string().min(10).max(900),
  }).strict()).min(3).max(7),
  suggestedHeadline: z.string().min(5).max(240),
  suggestedOverview: z.string().min(40).max(2400),
  keywordRecommendations: z.array(fitted(80).pipe(z.string().min(1))).max(20),
  researchNotes: z.array(z.object({
    title: z.string().min(2).max(180),
    insight: z.string().min(10).max(700),
    url: z.string().url().max(1000).or(z.literal("")),
  }).strict()).max(8),
  methodology: z.string().min(20).max(1000),
}).strict();

export type AuditReport = z.infer<typeof auditReportSchema> & {
  generatedAt?: string;
  provider?: string;
  source?: "ai" | "sample";
};

export const auditJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reportName", "profile", "executiveSummary", "biggestFlaw", "whyThisComesFirst", "alreadyWorking", "opportunity", "findings", "priorities", "suggestedHeadline", "suggestedOverview", "keywordRecommendations", "researchNotes", "methodology"],
  properties: {
    reportName: { type: "string" },
    profile: {
      type: "object",
      additionalProperties: false,
      required: ["name", "title", "niche", "services", "buyer", "rate", "jss", "jobs"],
      // maxLength is stated here so the model sees the limits it is held to (the schema is sent
      // to it as text). jss and jobs carry a description because the renderers append the words
      // "Job Success" and "jobs" themselves.
      properties: {
        ...Object.fromEntries(Object.entries(profileFieldLimits).map(([key, max]) => [key, { type: "string", maxLength: max }])),
        jss: { type: "string", maxLength: profileFieldLimits.jss, description: "Only the percentage, e.g. \"98%\". Empty string if not shown." },
        jobs: { type: "string", maxLength: profileFieldLimits.jobs, description: "Only the total number of jobs, e.g. \"5\". Empty string if not shown." },
      },
    },
    executiveSummary: { type: "string" },
    biggestFlaw: { type: "string" },
    whyThisComesFirst: { type: "string" },
    alreadyWorking: { type: "string" },
    opportunity: {
      type: "object",
      additionalProperties: false,
      required: ["title", "detail"],
      properties: { title: { type: "string" }, detail: { type: "string" } },
    },
    findings: {
      type: "array",
      minItems: 23,
      maxItems: 23,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "section", "title", "status", "note", "evidence", "action"],
        properties: {
          id: { type: "string", enum: [...criterionIds] },
          section: { type: "string", enum: [...auditSectionIds] },
          title: { type: "string" },
          status: { type: "string", enum: [...auditStatuses] },
          note: { type: "string" },
          evidence: { type: "string" },
          action: { type: "string" },
        },
      },
    },
    priorities: {
      type: "array",
      minItems: 3,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "detail"],
        properties: { id: { type: "string" }, title: { type: "string" }, detail: { type: "string" } },
      },
    },
    suggestedHeadline: { type: "string" },
    suggestedOverview: { type: "string" },
    keywordRecommendations: { type: "array", maxItems: 20, items: { type: "string" } },
    researchNotes: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "insight", "url"],
        properties: { title: { type: "string" }, insight: { type: "string" }, url: { type: "string" } },
      },
    },
    methodology: { type: "string" },
  },
} as const;
