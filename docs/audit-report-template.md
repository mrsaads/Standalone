# Improvexus Upwork Profile Audit — Report Template

This is the locked content and layout standard every generated audit must follow. It was built by
comparing the two supplied sample reports against the AI generation code already in `lib/audit-report.ts`,
`app/api/audits/route.ts`, and `lib/sample-report.ts`, and reconciling both against the product brief in
`Improvexus-End-to-End-Development-Prompt.md`. It replaces ad-hoc report shape with one contract that the
AI prompt, the schema, the review UI, and the PDF/DOCX exporters all point at.

## Why two references, one template

`MuhammadA_Upwork_Profile_Audit.pdf` and `JawadA_Upwork_Profile_Audit.pdf` are **not** two acceptable
variants of the same template — they are two different generations of the tool:

- **Muhammad's report** is from the earlier prototype (the Cloudflare Sites version referenced in the
  brief). It uses a 20-point/22-check scale, has no top confidential header band, no watermark, no page
  footer or page numbers, and no "Why This Comes First" / "What Is Already Working" sections.
- **Jawad's report** matches what the current codebase already targets: `lib/audit-report.ts` requires
  exactly 23 findings across the 8 sections below, `lib/audit-preview.ts`'s `sections` array is in this
  same order, and `lib/sample-report.ts` renders this exact layout — because Jawad's report **is** the
  hardcoded `sampleAuditReport` in that file, not an independent example.

**This template standardizes on Jawad's structure.** Muhammad's report should not be used as a shape
reference for new work; it predates the current rubric and schema. Any place in the app or its docs that
still implies a 20-point or 22-check scale is legacy and should be treated as a bug.

## The data contract

Every report is one `AuditReport` object (`lib/audit-report.ts`, `auditReportSchema`). A new client's
report is produced by taking their profile text/details/context, running it through the same AI
instructions (`app/api/audits/route.ts`), and validating the result against this schema before it is ever
rendered. Nothing is rendered from a hand-edited shape — the schema **is** the template's enforcement
mechanism.

Required top-level fields: `reportName`, `profile` (name, title, niche, services, buyer, rate, jss, jobs),
`executiveSummary`, `biggestFlaw`, `whyThisComesFirst`, `alreadyWorking`, `opportunity` (title, detail),
`findings` (exactly 23), `priorities` (3–7), `suggestedHeadline`, `suggestedOverview`,
`keywordRecommendations`, `researchNotes`, `methodology`.

## The 23 findings, in fixed section order

These 23 ids are not a naming suggestion — `auditFindingSchema` in `lib/audit-report.ts` constrains
`finding.id` to exactly this enum, and `auditReportSchema` separately validates (via `validateFindingSet`)
that all 23 appear, none is duplicated, and each is paired with its registered section. A report that is
missing one, duplicates one, or puts one in the wrong section is rejected before it ever reaches a
renderer — sorting into canonical order only ever fixes ordering, never a malformed criterion set, so the
validation has to happen first and separately.

| # | id | Section | Criterion |
|---|---|---|---|
| 1 | `photo` | Profile Fundamentals | Profile photo is polished, professional, and appropriate for the platform. |
| 2 | `video` | Profile Fundamentals | An introduction video is present and adds value. |
| 3 | `record` | Profile Fundamentals | Profile completeness and visible track record (JSS, reviews, jobs, hours) are easy to find. |
| 4 | `location` | Profile Fundamentals | Location and time zone are shown clearly. |
| 5 | `badges` | Profile Fundamentals | Status badges are internally consistent with each other and with the rest of the profile. |
| 6 | `headline` | Title | The headline or title is clear and specific about the service offered. |
| 7 | `niche` | Title | The advertised niche is credible and matches the supplied work history. |
| 8 | `outcome` | Overview | The overview explains business value or outcome, not just a list of tasks. |
| 9 | `scan` | Overview | The overview is well formatted and easy to scan quickly. |
| 10 | `next` | Overview | The overview ends with a clear, specific next step for the buyer. |
| 11 | `cases` | Portfolio | A sufficient number of relevant portfolio pieces are shown. |
| 12 | `thumbs` | Portfolio | Portfolio thumbnails are visually polished and professional. |
| 13 | `tags` | Skills & Certifications | Skill tags are specific and support the core offer. |
| 14 | `certificates` | Skills & Certifications | Certifications are from recognized, independently verifiable providers. |
| 15 | `reviews` | Work History & Reviews | Supplied reviews are consistently positive and specific, where visible. |
| 16 | `coverage` | Work History & Reviews | Job Success Score is consistent with the visible review record. |
| 17 | `consultation` | Pricing & Positioning | Consultation pricing, where offered, is logically consistent with the hourly rate. |
| 18 | `catalog` | Pricing & Positioning | Project Catalog pricing, where offered, matches the profile's positioning. |
| 19 | `market` | Pricing & Positioning | The hourly rate is credible and supported by the track record. |
| 20 | `catalog-visual` | Pricing & Positioning | Project Catalog visual presentation, where offered, is polished. |
| 21 | `employment` | Trust & Conversion Signals | Employment history is clearly explained, with no unexplained overlaps. |
| 22 | `identity` | Trust & Conversion Signals | Identity and/or payment verification indicators are present. |
| 23 | `jss` | Trust & Conversion Signals | A first-time visitor would trust this freelancer within about ten seconds. |

This table, the Zod schema, and the AI prompt's criteria list are all generated from one array —
`criterionRegistry` in `lib/audit-report.ts`. Changing the rubric means editing that array once, not
these four places separately.

Each finding carries: `id` (one of the 23 above), `section` (must match the registry, not just be a valid
section name), `title` (closely matching its named criterion), `status` (`pass` / `weak` / `fail` / `nv`),
`note`, `evidence` (short, quoted or paraphrased from the source), and `action` (can be empty only when
status is `pass` and nothing needs to change).

**Scoring:** pass = 1 point, weak = 0.5, fail = 0, `nv` (not verified) is excluded from the denominator
entirely — never treated as a fail and never silently defaulted to a guess. The score box shows
`points.toFixed(1) / assessedCount` (assessed = pass + weak + fail, never the raw 23), with the
`pass · weak · fail` breakdown next to it, and an `"N N/V excluded"` note appended whenever any finding
is `nv`. Jawad's report has zero `nv` findings, so it reads `17.0 / 23`; a report with unverifiable
checks should read closer to Muhammad's older `14.0 / 20 ... (2 N/A excluded)` pattern — this exact
behavior is implemented via `summarize()`'s `assessed` field in `lib/audit-preview.ts`.

**Do not invent evidence.** If Job Success, earnings, a badge, or a portfolio count is absent from the
source, the finding is `nv`, not a guessed `pass` or `fail`. Human auditor notes embedded in the source
text (e.g. "no video introduction", "improve dp") are attributed observations, not independently verified
facts, and must be labeled as such in `evidence`.

## Conditional analysis, not filler

Every report follows the same 8-section, 23-criterion order — that consistency is structural. What must
NOT be consistent across reports is the content of the two narrative fields that summarize the findings:

- **`alreadyWorking`** names only findings you marked `pass` with real supporting evidence. If nothing
  qualifies as a clean pass, it says so plainly — something like "No criterion currently has strong enough
  evidence to count as a confirmed strength" — rather than softening a `weak` or `fail` finding into a
  strength just to fill the section. A profile with three real strengths and a profile with none should
  read as visibly different reports, not as the same template with different nouns swapped in.
- **`whyThisComesFirst`** explains, in terms specific to that profile, why `biggestFlaw` outranks every
  other finding. It follows from the findings above it, not from a generic explanation that could be
  pasted into any report unchanged.

The AI prompt (`app/api/audits/route.ts`) states both rules directly. If a generated report's "What Is
Already Working" reads like boilerplate positivity regardless of the actual finding statuses, that's a
prompt-compliance failure to fix, not an acceptable stylistic variation.

## Page-by-page structure

The exporters produce a Letter-size (`612 × 792pt`), three-part flow — three pages for a typical audit,
but the layout is content-driven, not page-count-driven (see "Rendering rules" below). Reports with
noticeably more or less findings text should get more or fewer pages rather than clipped or padded content.

1. **Cover section** (top of the report): title "UPWORK PROFILE AUDIT REPORT", the italic subtitle
   "Improvexus — Profile Growth & Positioning Audit", a metadata table (Prepared for / Profile / Title /
   Hourly Rate / Track Record / Date), the Snapshot paragraph (`executiveSummary`), the score box
   (`OVERALL SCORE` + `BIGGEST FLAW` side by side), then "Why This Comes First" and "What Is Already
   Working" as short paragraphs — see "Conditional analysis, not filler" below for what these two must
   and must not say.
2. **Full Breakdown**: the 23 findings as tables, grouped and headed by the 8 section titles above, in
   that fixed order, each table row numbered 1–23 continuously across sections (never restarting per
   section, and never numbered by the AI's raw output order — see "Rendering rules").
3. **Close-out**: "Priority Fixes" (numbered, matching `priorities`), "Quick Profile Settings Checklist"
   (the same priorities as checkboxes), then "Beyond This Audit" — the fixed three-item Improvexus pitch
   (Upwork Bidding & Proposal Writing / Upwork & LinkedIn Profile Optimization / Email Marketing) closing
   with "Interested in any of these? Reply and we will scope it out together."

Both exports (PDF and DOCX) carry the same content in the same order from the same `AuditReport` object —
never generate the two formats from separately maintained copy.

## Branding

- Top strap-line on every page: `IMPROVEXUS · CONFIDENTIAL PROFILE AUDIT`.
- A large, pale, rotated "IMPROVEXUS" watermark on every page.
- Footer on every page: "Prepared by Improvexus" (left) and "Page N of M" (right).
- Typeface: Times New Roman throughout (matches both samples); navy/green/amber/red status colors as
  already defined in `lib/sample-report.ts`.
- Neither sample embeds the raster Improvexus logo file inside the report body — branding in the
  reference documents is typographic plus the watermark. Keep it that way unless the brand guidelines
  change; don't add the logo image back in without an explicit design decision, since it would deviate
  from the observed reference.

## Rendering rules (what makes a report "every client," not just Jawad)

These are the rules that make one template safely reusable for every new client, regardless of how long
or short their profile is:

1. **Never silently truncate.** The brief is explicit: "If long evidence or suggested copy exceeds that
   budget, append clearly labelled pages instead of clipping, silently dropping content or shrinking body
   text to unreadable size." No paragraph, finding note, or priority should be cut off with an ellipsis
   because it didn't fit a hardcoded page budget.
2. **Paginate on content, not on a fixed 3-page script.** The section loop (fundamentals → title →
   overview → portfolio → skills → history → pricing → trust) should check remaining vertical space before
   drawing each heading and each table row, and start a new page automatically when a block won't fit —
   rather than assuming pricing always has exactly 4 rows split 3-and-1 across two hardcoded page breaks.
   A client profile with much shorter or much longer findings/evidence text must still render cleanly.
3. **Validate the criterion set before sorting it, and sort by criterion identity, not arrival order.**
   `canonicalOrder()` in `lib/audit-preview.ts` sorts findings against the fixed 23-id order from
   `criterionRegistry`, so numbering is pinned to *which criterion a finding is*, not to whatever position
   the AI happened to emit it in. This only works because malformed input can't reach it: the schema's
   `validateFindingSet` already rejected a missing, duplicated, or mis-sectioned id before `canonicalOrder`
   ever runs. Sorting is an ordering fix, not a data-integrity fix — the two are separate steps for a reason.
4. **The AI's JSON is the only source of truth for a real client report.** The sample data in
   `lib/audit-preview.ts` is Jawad's example only, used for the "Sample report" button and first-run demo
   — it is not itself a template to copy-paste text from into a real audit.
5. **Score against `assessed`, not the raw finding count.** A client whose profile hides several metrics
   will legitimately have `nv` findings; the denominator must shrink to match, with a visible "N/V
   excluded" note, rather than quietly scoring them against all 23 as if they were checked. If every
   finding is `nv`, the score reads "Insufficient evidence to score" — never `0 / 0` or a blank percentage.
6. **No orphaned headings, no split table rows, no missing repeated headers.** A section heading is only
   drawn once there's confirmed room for it plus its table header plus its *actual first row's* height —
   the reservation uses the same wrap-based height calculation the row itself will use, not a flat
   placeholder, because a placeholder that's smaller than a real long-text row is exactly what let a
   heading and an empty table header get orphaned at the bottom of a page in an earlier version of this
   pass (found by rendering a long-content stress case and inspecting the page image, not assumed from the
   code). A table row's full height is computed the same way before it's drawn, so a row is never split
   across a page boundary. Every continuation page redraws the column header (labeled "(continued)" in the
   PDF; Word does this automatically via each table's repeating header row, plus `cantSplit` on every row).
7. **Invalid AI output must never become a report.** `app/api/audits/route.ts` validates the AI's JSON
   against `auditReportSchema` before anything is normalized or rendered. A first failure (bad JSON, wrong
   criterion set, out-of-range field) triggers exactly one retry with a corrective note listing what was
   wrong; a second failure returns a clear `AI_INVALID_OUTPUT` error to the client instead of ever letting a
   malformed or partially-invented report reach a user.

## Applying this template to a new client

For every new audit: collect profile text/details → run the AI instructions in
`app/api/audits/route.ts` (which already encode the 23-finding/8-section rubric above) → validate against
`auditReportSchema` → render with `lib/sample-report.ts`'s PDF/DOCX exporters. No manual per-client
template copy is needed or should be created; the schema plus the rendering rules above are the template.
If the rubric itself changes (a section is added, a scoring rule changes), update `auditFindingSchema`'s
count, the `instructions` prompt text, the `sections` array, and this document together — they must never
drift apart the way the six-criterion legacy rubric (`lib/audit.ts`) drifted from the 23-point one.
