// The six things on the landing page's "What we help with" grid, each with its own strategy screen
// at /services/<slug>. One source for the tile, the page, the sitemap and the structured data, so
// they can never describe a service differently.
//
// House rules for this copy (they are the brand, not decoration):
//   - Describe what we DO and what you GET. Never promise rankings, jobs, interviews or earnings —
//     nobody controls a client's hiring decision, and saying otherwise is the fastest way to lose
//     the trust the rest of the page is trying to earn.
//   - Every strategy step says what changes in the person's own working week.

export type ServiceIcon = "audit" | "positioning" | "bidding" | "management" | "reporting" | "evidence";

export type Service = {
  slug: string;
  icon: ServiceIcon;
  title: string; // tile + nav
  tile: string; // one line on the landing grid
  seoTitle: string;
  seoDescription: string;
  eyebrow: string;
  h1: string;
  intro: string;
  // "Where the time and the replies are being lost" — the situation before we start.
  problems: { title: string; body: string }[];
  // "How we improve your work" — the strategy, in order.
  strategy: { title: string; body: string; change: string }[];
  deliverables: string[];
  measures: string[];
  faqs: { q: string; a: string }[];
};

export const SERVICES: Service[] = [
  {
    slug: "upwork-profile-audit-optimization",
    icon: "audit",
    title: "Upwork profile audits & optimization",
    tile: "A structured, evidence-based review of your headline, overview, portfolio, and proof of work.",
    seoTitle: "Upwork Profile Audit & Optimization Service",
    seoDescription:
      "A 23-point, evidence-based Upwork profile audit of your headline, overview, portfolio and proof — with a prioritised plan for what to fix first.",
    eyebrow: "PROFILE AUDIT & OPTIMIZATION",
    h1: "Find out exactly what your Upwork profile is costing you — then fix it in the right order.",
    intro:
      "Most profiles are not bad. They are unclear: a client lands on them from a proposal, spends a few seconds deciding whether this person does the thing they need, and leaves without an answer. An audit replaces the guessing with a list — what is working, what is missing, and what to change first.",
    problems: [
      { title: "You are editing blind", body: "You rewrite the overview every few weeks because something feels off, with no way to tell whether the last version was better or worse." },
      { title: "Advice that fits nobody", body: "Generic checklists tell every freelancer to \"add keywords\" and \"be specific\". They cannot tell you which of your portfolio items is doing the damage." },
      { title: "The profile and the proposals disagree", body: "Your proposals pitch one service and your profile describes four. A client who clicks through sees a different freelancer from the one who wrote to them." },
    ],
    strategy: [
      { title: "Score the profile against a fixed rubric", body: "We review your profile across 23 criteria in 8 areas — offer clarity, relevant work, buyer relevance, credible proof, a clear next step and platform consistency among them. Every score is tied to something actually on the profile. Anything we cannot verify is excluded from the score rather than guessed.", change: "You stop wondering what is wrong and start with a ranked list." },
      { title: "Separate what matters from what is cosmetic", body: "Not every weak point is worth your time. We rank findings by how much they affect a client's first read: an unclear offer at the top of the overview outranks a missing certification every time.", change: "Your next three profile edits are the three with the most effect." },
      { title: "Rewrite with you, not at you", body: "For each priority we propose the change — a tighter title, a restructured opening, a portfolio item re-ordered or re-captioned — and explain the reasoning, so you can keep the profile current yourself afterwards.", change: "You learn the pattern instead of renting it." },
      { title: "Re-audit after the changes", body: "The same rubric, run again. The before-and-after is on one page, so an improvement is something you can see rather than something you hope happened.", change: "You get proof of what moved, exportable as a PDF or Word report." },
    ],
    deliverables: [
      "A scored 23-point audit with the evidence behind each finding",
      "A prioritised action list — what to change first, second and third",
      "Suggested rewrites for the title and opening lines",
      "A branded PDF / Word report you can keep",
    ],
    measures: ["Assessed score before and after", "Number of criteria passing, weak and failing", "Which findings were verified and which could not be"],
    faqs: [
      { q: "Can I run the audit myself?", a: "Yes. The audit tool is self-serve — create an account and run it on your own profile. A managed engagement adds a person who applies the findings with you." },
      { q: "Will a better profile guarantee more jobs?", a: "No, and anyone who says it will is guessing. A clearer profile removes reasons for a client to leave. Whether they hire depends on the job, the competition and your proposal — which is why we track what changed rather than promise a result." },
    ],
  },
  {
    slug: "upwork-positioning-headline-overview",
    icon: "positioning",
    title: "Positioning, headlines & overview",
    tile: "Sharper opening lines built around a specific buyer and a deliverable you can back up.",
    seoTitle: "Upwork Headline, Overview & Positioning Service",
    seoDescription:
      "Positioning for Upwork freelancers and agencies: one clear buyer, one clear deliverable, and a headline and overview that say so in two lines.",
    eyebrow: "POSITIONING, HEADLINE & OVERVIEW",
    h1: "Say who you help and what they get — in the two lines a client actually reads.",
    intro:
      "On Upwork a client sees your title and roughly the first two lines of your overview before deciding whether to open the rest. Positioning is the work of making those lines carry the whole offer: who it is for, what they receive, and why you are a credible person to deliver it.",
    problems: [
      { title: "A title that lists tools", body: "\"WordPress | Shopify | SEO | Figma\" tells a client what you own, not what you will do for them. It also reads identically to several thousand other profiles." },
      { title: "An overview about you", body: "Opening with years of experience and enthusiasm puts the client's problem in paragraph three, below the fold they never reach." },
      { title: "Trying to be hired for everything", body: "A profile aimed at every possible job is the strongest match for none of them. Broad positioning feels safe and performs worst." },
    ],
    strategy: [
      { title: "Choose the buyer on evidence", body: "We look at the work you have already been hired for, the jobs you win versus the jobs you only apply to, and where your portfolio is strongest. The buyer you lead with is the one your evidence supports — not the one that sounds most impressive.", change: "You stop writing to \"clients\" and start writing to one kind of client." },
      { title: "Name the deliverable", body: "We turn \"I do web development\" into a thing a client can picture receiving, with the scope and the outcome you can honestly stand behind.", change: "Clients can tell in one read whether you do the thing they need." },
      { title: "Rebuild the title and the first two lines", body: "Several options, each built on the same buyer and deliverable, so you choose between good versions rather than between a rewrite and nothing. Tool lists and biography move below the opening, where they support rather than lead.", change: "The part of the profile that gets read finally does the selling." },
      { title: "Carry it through the rest of the profile", body: "Skills, category, portfolio order and specialised profiles are aligned with the same offer, so the profile tells one story from the title down.", change: "Your proposals and your profile stop contradicting each other." },
    ],
    deliverables: [
      "A positioning statement: buyer, deliverable, proof",
      "Three title options and three opening-line options",
      "A restructured overview in your own voice",
      "A consistency pass across skills, category and portfolio order",
    ],
    measures: ["Offer-clarity and buyer-relevance scores on the audit rubric", "Whether every claim in the opening is backed by something on the profile"],
    faqs: [
      { q: "Do you write in my voice or a template?", a: "Yours. We start from how you already describe your work and tighten it. A template is exactly what makes profiles read alike." },
      { q: "What if I really do offer several services?", a: "Upwork's specialised profiles exist for that. We position the main profile around your strongest offer and use specialised profiles for the others, rather than diluting one page." },
    ],
  },
  {
    slug: "upwork-bidding-proposal-support",
    icon: "bidding",
    title: "Job targeting & proposal support",
    tile: "Help finding the right jobs and writing proposals that speak to the client's actual problem.",
    seoTitle: "Upwork Bidder & Proposal Writing Service",
    seoDescription:
      "Dedicated Upwork bidders for freelancers and agencies: job targeting, proposals written to each client's brief, and a weekly record of results.",
    eyebrow: "UPWORK BIDDING & PROPOSAL SUPPORT",
    h1: "A dedicated Upwork bidder who targets the right jobs and writes to the client's real problem.",
    intro:
      "Bidding is where most of a freelancer's unpaid hours go, and where most Connects are wasted. What separates top Upwork bidders from everyone else is not volume or a clever template. It is choosing fewer, better-matched jobs, reaching them early, and writing an opening that proves the brief was actually read.",
    problems: [
      { title: "Hours of bidding, few replies", body: "You spend the best part of your day scrolling the feed and sending proposals, and that time comes straight out of client work — or out of your evening." },
      { title: "Connects spent on jobs you could never win", body: "Vague briefs, unverified clients, budgets far below your rate, jobs with fifty proposals already in. Each one costs the same Connects as a good fit." },
      { title: "One proposal, pasted everywhere", body: "A saved template with the client's name swapped in is recognisable from its first line. Clients skim dozens of them and reply to the one that mentions their actual problem." },
      { title: "Late to the job", body: "Many clients read the first handful of proposals and stop. If the good jobs are posted while you are asleep, you are bidding into a queue." },
    ],
    strategy: [
      { title: "Build your targeting profile", body: "Before a single proposal goes out we agree what a good job looks like for you: categories, budget floor, client history, project size, and the red flags that mean skip. This becomes a written filter, not a feeling.", change: "Connects stop going to jobs you were never going to win." },
      { title: "Watch the feed in the hours you can't", body: "Our bidders work your target feed across the time zones your clients post in, so well-matched jobs are found and answered while they are still fresh rather than the next morning.", change: "You get your bidding hours back for paid work." },
      { title: "Write each proposal to the brief", body: "Every proposal opens with the client's problem in their own terms, then the specific piece of your past work that resembles it, then one clear next step. No template openings, no biography first.", change: "The client's first line of reading is about their project, not about you." },
      { title: "Keep you in control of what is sent", body: "You approve the targeting rules and the voice. For anything outside the agreed pattern — a large fixed-price bid, an unusual scope — we check with you first. Conversations with the client are yours.", change: "Nothing goes out under your name that you would not have said." },
      { title: "Review the record every week", body: "Every proposal sent, viewed, replied to and interviewed is logged, with what we noticed. Targeting rules and proposal structure are adjusted from that record, not from a hunch.", change: "Your bidding gets more selective and more accurate over time." },
    ],
    deliverables: [
      "A written targeting profile and skip-list",
      "Proposals written per job, in your voice",
      "A log of every proposal: job, Connects, status",
      "A weekly review with what we are changing and why",
    ],
    measures: ["Proposals sent and Connects spent", "Views, replies and interviews — reported as counts, never projected", "Reply rate by job type, so targeting can be tightened"],
    faqs: [
      { q: "How does account access work?", a: "We do not ask for your password. Where you operate as an agency, a bidder is added through Upwork's own agency team roles; otherwise we prepare the targeting and the proposal text and you submit it. We work inside Upwork's terms because your account is the thing we are trying to protect." },
      { q: "How many jobs will I get?", a: "We do not promise a number. Hiring decisions belong to clients. What we commit to is the work — the targeting, the proposals, the weekly record — and showing you plainly what it produced." },
      { q: "Who pays for Connects?", a: "Connects are bought on your own Upwork account and stay yours. The log shows exactly where each one went." },
    ],
  },
  {
    slug: "upwork-profile-management",
    icon: "management",
    title: "Ongoing profile management",
    tile: "Continuous upkeep as your services, rates, and portfolio evolve.",
    seoTitle: "Upwork Profile Management Service",
    seoDescription:
      "Ongoing Upwork profile management: portfolio, rates, skills and specialised profiles kept current as your work changes, with every change recorded.",
    eyebrow: "ONGOING PROFILE MANAGEMENT",
    h1: "Your profile kept current while you get on with the work.",
    intro:
      "A profile is accurate on the day it is written and drifts from then on. You finish a better project than anything in your portfolio and never add it. You raise your rate in proposals but not on the profile. Managed upkeep closes that gap continuously instead of in one exhausting rewrite a year.",
    problems: [
      { title: "Your best work is not on your profile", body: "The strongest evidence you have is in a finished contract from last month, and the portfolio still leads with something from two years ago." },
      { title: "The profile describes who you used to be", body: "Services you no longer offer, a rate you no longer charge, skills you have moved past — each one is a small mismatch a client notices." },
      { title: "Maintenance never reaches the top of the list", body: "It is never urgent, so it never happens. Then a quiet month arrives and the profile is the first thing you wish you had fixed." },
    ],
    strategy: [
      { title: "Set a baseline", body: "We start with a full audit so there is a recorded starting point for the profile, the portfolio and the positioning.", change: "Every later change has something to be compared against." },
      { title: "Agree a monthly upkeep plan", body: "A short, fixed list: what gets reviewed each cycle — portfolio order, new work to add, rate, availability, skills, specialised profiles — and what triggers an unscheduled update.", change: "Upkeep becomes a routine someone owns, not a chore you postpone." },
      { title: "Turn finished work into proof", body: "When you complete a project we help turn it into a portfolio item: the brief, your contribution, and the outcome where there is evidence for one. Self-initiated samples are labelled as such.", change: "Good work starts earning for you instead of disappearing into your contract history." },
      { title: "Record every change", body: "What changed, when, and why, visible in your client portal. If a change does not help, it can be traced and reversed.", change: "You can see the history of your own profile instead of trusting memory." },
    ],
    deliverables: [
      "A baseline audit and an agreed upkeep plan",
      "Portfolio items written from your completed work",
      "Rate, skills and specialised-profile reviews each cycle",
      "A change log in your client portal",
    ],
    measures: ["Audit score at baseline and at each review", "Changes made per cycle, each with its reason", "Open items waiting on you"],
    faqs: [
      { q: "Do you change things without asking?", a: "No. Routine upkeep follows the plan you agreed. Anything that alters how you are positioned — your title, your rate, your primary service — is proposed first." },
      { q: "Is this the same as the client portal?", a: "The client portal is where a managed engagement lives: your weekly reports, the change log and anything that needs your input. Access is set up by our team once an engagement starts." },
    ],
  },
  {
    slug: "weekly-reporting-progress-reviews",
    icon: "reporting",
    title: "Weekly reporting & progress reviews",
    tile: "Regular check-ins on what changed, what it affected, and what's next.",
    seoTitle: "Weekly Upwork Reporting & Progress Reviews",
    seoDescription:
      "A weekly report on your Upwork activity: proposals, replies, profile changes and next actions — measured values only, with gaps stated.",
    eyebrow: "WEEKLY REPORTING & PROGRESS REVIEWS",
    h1: "Know what was done on your account this week, what it produced, and what happens next.",
    intro:
      "The usual complaint about agencies is not that the work is poor — it is that nobody can tell what the work was. A weekly report fixes that. It is short, it is the same shape every week, and it only contains things that were actually measured.",
    problems: [
      { title: "You are paying and cannot see for what", body: "Activity happens on your account and reaches you as a reassuring message rather than a record." },
      { title: "Numbers without context", body: "\"Thirty proposals sent\" means little without knowing which jobs, how many were viewed, and what was learned." },
      { title: "No decision ever gets made", body: "Without a regular review, the same approach runs for months whether or not it is working." },
    ],
    strategy: [
      { title: "Agree what gets measured", body: "At the start we fix a small set of figures that matter for your account — proposals sent, Connects spent, views, replies, interviews, profile changes. The set stays the same so weeks can be compared.", change: "You read the same report every week and spot a change at a glance." },
      { title: "Report measured values only", body: "If a figure was not captured in a period, the report says \"Not provided\". A gap is never shown as a zero, and a zero is never hidden as a gap.", change: "You can trust that a number on the page was actually counted." },
      { title: "Explain, do not just list", body: "Each report states what was done, what it appears to have affected, and what we are changing next week as a result. Comparisons with the previous period appear only where one is meaningful.", change: "You get a reasoned next step, not a spreadsheet." },
      { title: "Surface what needs you", body: "Anything waiting on your input — a rate decision, a portfolio approval, a client reply — is listed at the top, so nothing stalls unnoticed.", change: "You know your own to-do list in thirty seconds." },
    ],
    deliverables: [
      "A weekly report in your client portal, exportable",
      "Period-over-period comparisons where they are valid",
      "A clear list of actions for us and for you",
      "A history of every past report",
    ],
    measures: ["Proposals, views, replies and interviews for the period", "Profile changes made", "Items that were not measured — named, not omitted"],
    faqs: [
      { q: "What if a week went badly?", a: "Then the report says so. A report that only ever contains good news is a brochure. The point is to see a bad week early enough to change something." },
      { q: "Can I see reports from earlier weeks?", a: "Yes. Every published report stays in your client portal, so you can look back over the whole engagement." },
    ],
  },
  {
    slug: "evidence-before-assumptions",
    icon: "evidence",
    title: "Evidence before assumptions",
    tile: "Every finding is tied to something actually on your profile — never a guess.",
    seoTitle: "Our Method: Evidence Before Assumptions",
    seoDescription:
      "How Improvexus works on Upwork accounts: findings tied to evidence, unverified checks left out of scores, and no promises of rankings or jobs.",
    eyebrow: "HOW WE WORK",
    h1: "We tell you what the evidence shows — and say plainly when there isn't any.",
    intro:
      "Upwork advice is full of confident claims nobody can check: secret algorithm tricks, guaranteed job counts, \"rank #1\" promises. This is the rule we work by instead, and it applies to every audit, proposal and report we produce.",
    problems: [
      { title: "Advice you cannot verify", body: "A tip about how Upwork's search \"really\" works is unfalsifiable. You follow it, something changes or does not, and you never learn whether the tip was the cause." },
      { title: "Guarantees nobody can keep", body: "No agency controls a client's hiring decision. A promised number of jobs is either luck taken as credit, or a sales line." },
      { title: "Recommendations with no reason attached", body: "\"Change your headline\" is an instruction. \"Your headline lists tools and never names the buyer — here is the line\" is a finding you can check yourself." },
    ],
    strategy: [
      { title: "Tie every finding to something on the page", body: "Each point in an audit cites the part of your profile it is based on. If you disagree, you can look at exactly what we looked at.", change: "You can check our reasoning instead of taking it on trust." },
      { title: "Leave out what we cannot verify", body: "When a criterion cannot be assessed from the evidence available, it is marked unverified and excluded from the score. It is not filled in with a plausible guess.", change: "Your score reflects your profile, not our assumptions about it." },
      { title: "Report counts, never projections", body: "Reports show what happened: proposals sent, replies received. We do not extrapolate them into forecasts of income or job counts.", change: "You plan from real numbers." },
      { title: "Change one thing, then look", body: "Where we can, changes are made in a way that lets us see their effect — a new opening line across a batch of proposals, not five changes at once.", change: "You learn what actually works for your account." },
    ],
    deliverables: [
      "Audits where every finding cites its evidence",
      "Unverified criteria marked and excluded from scoring",
      "Reports that separate \"measured\" from \"not provided\"",
      "No promise of rankings, jobs or earnings — in writing",
    ],
    measures: ["Share of findings backed by profile evidence", "Criteria marked unverified", "Changes tested and what was observed"],
    faqs: [
      { q: "Isn't a guarantee more reassuring?", a: "Until it is not met. We would rather tell you what we will do and show you what it produced than sell a number we have no way to control." },
      { q: "Does this make the work slower?", a: "Slightly more careful, not slower. Checking a finding against the profile takes minutes; acting on a wrong guess costs weeks." },
    ],
  },
];

const BY_SLUG = new Map(SERVICES.map(s => [s.slug, s]));
export const getService = (slug: string) => BY_SLUG.get(slug);
