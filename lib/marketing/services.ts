// The six things on the landing page's "What we help with" grid, each with its own strategy screen
// at /services/<slug>. One source for the tile, the page, the sitemap and the structured data, so
// they can never describe a service differently.
//
// House rules for this copy:
//   - Describe what we DO and what you GET. Never promise rankings, jobs, interviews or earnings.
//     Nobody controls a client's hiring decision.
//   - Every strategy step says what changes in the person's own working week.
//   - Write the way a person on the team would say it out loud: contractions, plain words, no long
//     dashes, no slogans. scripts/local-tests/marketing-content.local-test.mts checks the dashes.

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
    tile: "We go through your headline, overview, portfolio and proof of work, and show you what to fix first.",
    seoTitle: "Upwork Profile Audit & Optimization Service",
    seoDescription:
      "A 23-point Upwork profile audit covering your headline, overview, portfolio and proof of work, with a clear list of what to fix first.",
    eyebrow: "PROFILE AUDIT & OPTIMIZATION",
    h1: "Find out what's holding your Upwork profile back, then fix it in the right order.",
    intro:
      "Most profiles we see aren't bad. They're unclear. A client clicks through from a proposal, takes a few seconds to work out whether you do what they need, and leaves without an answer. An audit gives you a list to work from: what's fine, what's missing and what to change first.",
    problems: [
      { title: "You keep editing without knowing if it helps", body: "You rewrite the overview every few weeks because something feels off, and you have no way of telling whether the new version is better than the old one." },
      { title: "The advice you find is the same for everyone", body: "Checklists tell every freelancer to \"add keywords\" and \"be specific\". They can't tell you which of your own portfolio items is putting clients off." },
      { title: "Your profile and your proposals don't match", body: "Your proposals pitch one service and your profile lists four. A client who clicks through meets a different freelancer from the one who wrote to them." },
    ],
    strategy: [
      { title: "We score the profile against a fixed list", body: "We check your profile on 23 points in 8 areas, including how clear the offer is, how relevant the work is, how believable the proof is and whether there's a clear next step. Each score points to something that is on your profile today. If we can't verify a point, we leave it out of the score.", change: "You get a ranked list of what's wrong, so you can stop guessing." },
      { title: "We sort the big problems from the small ones", body: "Some weak points aren't worth your time. We order the findings by how much they affect a client's first read. An unclear offer at the top of your overview matters far more than a missing certificate.", change: "Your next three edits are the three that will make the most difference." },
      { title: "We rewrite it with you", body: "For each priority we suggest the change and tell you why. That might be a tighter title, a new opening, or a portfolio item moved up and given a better caption. Once you know the reasoning you can keep the profile up to date on your own.", change: "You understand why each change was made, so you can do it yourself next time." },
      { title: "We audit it again afterwards", body: "We run the same 23 points a second time and put the before and after on one page, so you can see what improved.", change: "You have a record of what moved, and you can export it as a PDF or Word report." },
    ],
    deliverables: [
      "A scored 23-point audit, with the reason behind each finding",
      "A list of what to change first, second and third",
      "Suggested rewrites for your title and opening lines",
      "A report in PDF or Word that you can keep",
    ],
    measures: ["Your score before and after", "How many points pass, how many are weak and how many fail", "Which findings we could verify and which we couldn't"],
    faqs: [
      { q: "Can I run the audit myself?", a: "Yes. Create an account and run the audit tool on your own profile whenever you like. If you want someone to go through the findings and apply them with you, that's what a managed engagement is for." },
      { q: "Will a better profile guarantee more jobs?", a: "No. Anyone who tells you it will is guessing. A clearer profile gives a client fewer reasons to leave. Whether they hire you still depends on the job, the competition and your proposal, so we track what changed and we don't promise a result." },
    ],
  },
  {
    slug: "upwork-positioning-headline-overview",
    icon: "positioning",
    title: "Positioning, headlines & overview",
    tile: "Opening lines written for one kind of client and one thing you can deliver and prove.",
    seoTitle: "Upwork Headline, Overview & Positioning Service",
    seoDescription:
      "Positioning for Upwork freelancers and agencies. We help you pick one buyer and one deliverable, then write a headline and overview that say so.",
    eyebrow: "POSITIONING, HEADLINE & OVERVIEW",
    h1: "Say who you help and what they get, in the two lines a client reads.",
    intro:
      "On Upwork a client sees your title and about the first two lines of your overview before deciding whether to open the rest. Those lines have to do a lot. They need to say who the work is for, what the client will get and why you're a safe person to hire for it.",
    problems: [
      { title: "Your title is a list of tools", body: "\"WordPress | Shopify | SEO | Figma\" tells a client what you can use. It doesn't tell them what you'll do for them, and thousands of other profiles say the same thing." },
      { title: "Your overview is about you", body: "If you open with your years of experience and how passionate you are, the client's problem doesn't come up until the third paragraph. Most clients never read that far." },
      { title: "You're trying to be hired for everything", body: "A profile aimed at every possible job ends up being the best match for none of them. Going broad feels safe, but it's usually what performs worst." },
    ],
    strategy: [
      { title: "We pick the buyer from your own history", body: "We look at the work you've already been hired for, the jobs you win compared with the ones you only apply to, and where your portfolio is strongest. You lead with the kind of client your track record supports, even if another one sounds more impressive.", change: "You write to one kind of client and stop writing to \"clients\" in general." },
      { title: "We name what you deliver", body: "\"I do web development\" becomes something a client can picture receiving, with a scope and an outcome you can honestly stand behind.", change: "A client can tell in one read whether you do what they need." },
      { title: "We rewrite the title and the first two lines", body: "You get a few options, all built on the same buyer and the same deliverable, so you're choosing between good versions. Tool lists and your background move further down, where they back up the opening.", change: "The part of your profile that clients read is the part that sells." },
      { title: "We carry it through the rest of the profile", body: "Your skills, category, portfolio order and specialised profiles are lined up behind the same offer, so the profile says one thing from the title down.", change: "Your proposals and your profile say the same thing." },
    ],
    deliverables: [
      "A short positioning statement covering buyer, deliverable and proof",
      "Three title options and three opening-line options",
      "A restructured overview in your own voice",
      "A check that skills, category and portfolio order all match",
    ],
    measures: ["Your audit scores for offer clarity and buyer relevance", "Whether every claim in your opening is backed by something on the profile"],
    faqs: [
      { q: "Do you write in my voice or use a template?", a: "Your voice. We start from the way you already describe your work and tighten it. Templates are the reason so many profiles sound alike." },
      { q: "What if I really do offer several services?", a: "That's what Upwork's specialised profiles are for. We build the main profile around your strongest offer and use specialised profiles for the others, so one page isn't trying to cover everything." },
    ],
  },
  {
    slug: "upwork-bidding-proposal-support",
    icon: "bidding",
    title: "Job targeting & proposal support",
    tile: "Help finding the right jobs and writing proposals that deal with the client's own problem.",
    seoTitle: "Upwork Bidder & Proposal Writing Service",
    seoDescription:
      "Dedicated Upwork bidders for freelancers and agencies. We pick the right jobs, write each proposal to the client's brief and report results weekly.",
    eyebrow: "UPWORK BIDDING & PROPOSAL SUPPORT",
    h1: "A dedicated Upwork bidder who picks the right jobs and writes to the client's real problem.",
    intro:
      "Bidding is where most of a freelancer's unpaid hours go, and where most Connects get wasted. The top Upwork bidders don't win by sending more proposals or by having a clever template. They choose fewer jobs that fit better, they get to them early, and their first lines show they read the brief.",
    problems: [
      { title: "Hours of bidding and hardly any replies", body: "You spend the best part of the day scrolling the feed and sending proposals. That time comes out of client work, or out of your evening." },
      { title: "Connects spent on jobs you were never going to win", body: "Vague briefs, unverified clients, budgets far below your rate, jobs that already have fifty proposals. Each of them costs the same Connects as a job that suits you." },
      { title: "The same proposal pasted everywhere", body: "A saved template with the client's name swapped in is easy to spot from the first line. Clients skim dozens of these and reply to the one that mentions their own problem." },
      { title: "You get to the job late", body: "Plenty of clients read the first few proposals and stop there. If the good jobs go up while you're asleep, yours lands at the back of the queue." },
    ],
    strategy: [
      { title: "We agree what a good job looks like", body: "Before any proposal goes out we sit down with you and write it out: the categories, your lowest budget, the kind of client history you want, the project size and the warning signs that mean skip. From then on we filter jobs against that list.", change: "Your Connects stop going to jobs you had no chance of winning." },
      { title: "We watch the feed in the hours you can't", body: "Our bidders cover your feed across the time zones your clients post in. A job that suits you gets found and answered while it's still new, and doesn't wait until the next morning.", change: "You get your bidding hours back for paid work." },
      { title: "We write each proposal to the brief", body: "Every proposal opens with the client's problem in their own words. Next comes the piece of your past work that's closest to it, and then one clear next step. We don't use template openings and we don't start with your biography.", change: "The first thing the client reads is about their project." },
      { title: "You stay in charge of what gets sent", body: "You approve the targeting rules and the tone. If something falls outside what we agreed, such as a large fixed-price bid or an unusual scope, we check with you first. Conversations with the client stay with you.", change: "Nothing goes out under your name that you wouldn't have said yourself." },
      { title: "We go through the record every week", body: "We log every proposal that was sent, viewed, replied to or led to an interview, along with what we noticed. We adjust the targeting and the way proposals are written based on that log.", change: "Your bidding gets more selective and more accurate as the weeks go by." },
    ],
    deliverables: [
      "A written targeting profile and a list of jobs to skip",
      "Proposals written for each job, in your voice",
      "A log of every proposal with the job, the Connects spent and the status",
      "A weekly review of what we're changing and why",
    ],
    measures: ["Proposals sent and Connects spent", "Views, replies and interviews, reported as real counts", "Reply rate by job type, so we can tighten the targeting"],
    faqs: [
      { q: "How does account access work?", a: "We don't ask for your password. If you run an agency on Upwork, we add a bidder through Upwork's own agency team roles. If you don't, we prepare the targeting and the proposal text and you submit it yourself. We stay inside Upwork's terms because your account is the thing we're here to protect." },
      { q: "How many jobs will I get?", a: "We don't promise a number, because the hiring decision is the client's. What we commit to is the work itself, meaning the targeting, the proposals and the weekly record, and we show you plainly what came of it." },
      { q: "Who pays for Connects?", a: "You buy Connects on your own Upwork account and they stay yours. The log shows where each one went." },
    ],
  },
  {
    slug: "upwork-profile-management",
    icon: "management",
    title: "Ongoing profile management",
    tile: "We keep your profile up to date as your services, rates and portfolio change.",
    seoTitle: "Upwork Profile Management Service",
    seoDescription:
      "Ongoing Upwork profile management. We keep your portfolio, rates, skills and specialised profiles current as your work changes, and log every change.",
    eyebrow: "ONGOING PROFILE MANAGEMENT",
    h1: "Your profile kept up to date while you get on with the work.",
    intro:
      "A profile is accurate on the day you write it and slips out of date after that. You finish a project that's better than anything in your portfolio and never add it. You raise your rate in proposals and forget to change it on the profile. With managed upkeep those gaps get closed a little at a time, so you don't have to face one big rewrite every year.",
    problems: [
      { title: "Your best work isn't on your profile", body: "The strongest proof you have is a contract you finished last month, and your portfolio still opens with something from two years ago." },
      { title: "Your profile describes who you used to be", body: "It still lists services you've stopped offering, a rate you no longer charge and skills you've moved on from. Clients notice these small mismatches." },
      { title: "Upkeep never gets to the top of your list", body: "It's never urgent, so it doesn't get done. Then a quiet month comes along and the profile is the first thing you wish you'd sorted out." },
    ],
    strategy: [
      { title: "We record where you're starting from", body: "We begin with a full audit, so there's a starting point on record for the profile, the portfolio and the positioning.", change: "Every later change can be compared with where you began." },
      { title: "We agree a monthly upkeep plan", body: "It's a short, fixed list of what we review each month: portfolio order, new work to add, your rate, availability, skills and specialised profiles. We also agree what should trigger an update between reviews.", change: "Upkeep turns into a routine that someone is responsible for." },
      { title: "We turn finished work into proof", body: "When you complete a project we help you write it up as a portfolio item, covering the brief, what you did and the result if there's evidence for one. If a sample is self-initiated, we label it that way.", change: "Your good work goes on show and doesn't get buried in your contract history." },
      { title: "We log every change", body: "You can see what changed, when and why in your client portal. If a change doesn't help, we can trace it and undo it.", change: "You can look up the history of your own profile and don't have to rely on memory." },
    ],
    deliverables: [
      "A starting audit and an agreed upkeep plan",
      "Portfolio items written up from your completed work",
      "A review of your rate, skills and specialised profiles each month",
      "A change log in your client portal",
    ],
    measures: ["Your audit score at the start and at each review", "The changes made each month, with the reason for each", "Anything waiting on you"],
    faqs: [
      { q: "Do you change things without asking?", a: "No. Routine upkeep follows the plan you agreed to. If a change would affect how you're positioned, for example your title, your rate or your main service, we propose it to you first." },
      { q: "Is this the same as the client portal?", a: "The client portal is where a managed engagement lives. You'll find your weekly reports there, along with the change log and anything that needs your input. Our team sets up your access once the engagement starts." },
    ],
  },
  {
    slug: "weekly-reporting-progress-reviews",
    icon: "reporting",
    title: "Weekly reporting & progress reviews",
    tile: "A regular check-in on what changed, what it affected and what's next.",
    seoTitle: "Weekly Upwork Reporting & Progress Reviews",
    seoDescription:
      "A weekly report on your Upwork activity covering proposals, replies, profile changes and next steps. Only real numbers, and gaps are stated.",
    eyebrow: "WEEKLY REPORTING & PROGRESS REVIEWS",
    h1: "Know what was done on your account this week, what came of it and what happens next.",
    intro:
      "People who've worked with an agency before rarely complain that the work was bad. Their complaint is that they couldn't tell what the work was. A weekly report solves that. It's short, it follows the same layout every week, and everything in it was measured.",
    problems: [
      { title: "You're paying and can't see what for", body: "Things happen on your account, and all you hear about them is a friendly message saying it's going well." },
      { title: "Numbers with nothing around them", body: "\"Thirty proposals sent\" doesn't tell you much unless you also know which jobs they were for, how many were viewed and what was learned." },
      { title: "Nobody ever makes a decision", body: "When there's no regular review, the same approach carries on for months whether it's working or not." },
    ],
    strategy: [
      { title: "We agree what gets measured", body: "At the start we settle on a small set of figures that matter for your account: proposals sent, Connects spent, views, replies, interviews and profile changes. We keep that set the same so you can compare one week with the next.", change: "You read the same report every week and can spot a change straight away." },
      { title: "We only report what was measured", body: "If we didn't capture a figure in a given week, the report says \"Not provided\". We never show a gap as a zero, and we never pass off a zero as a gap.", change: "When you see a number on the page, you know someone counted it." },
      { title: "We explain the numbers", body: "Each report says what we did, what it seems to have affected and what we're changing next week because of it. We only compare with the previous period when the comparison means something.", change: "You get a next step with a reason behind it, and you aren't left to read a spreadsheet." },
      { title: "We put what needs you at the top", body: "Anything that's waiting on you, such as a rate decision, a portfolio approval or a reply to a client, is listed first so it doesn't get stuck.", change: "You can see your own to-do list in half a minute." },
    ],
    deliverables: [
      "A weekly report in your client portal that you can export",
      "Comparisons with the previous period where they're valid",
      "A clear list of actions for us and for you",
      "Every past report, kept in one place",
    ],
    measures: ["Proposals, views, replies and interviews for the period", "Profile changes made", "Anything that wasn't measured, listed by name"],
    faqs: [
      { q: "What if a week went badly?", a: "Then the report says so. If a report only ever has good news in it, it's a brochure. We want you to see a bad week early enough to change something." },
      { q: "Can I see reports from earlier weeks?", a: "Yes. Every published report stays in your client portal, so you can look back over the whole engagement." },
    ],
  },
  {
    slug: "evidence-before-assumptions",
    icon: "evidence",
    title: "Evidence before assumptions",
    tile: "Every finding points to something that is on your profile. We don't guess.",
    seoTitle: "Our Method: Evidence Before Assumptions",
    seoDescription:
      "How Improvexus works on Upwork accounts. Every finding is tied to evidence, unverified checks stay out of the score, and we don't promise rankings.",
    eyebrow: "HOW WE WORK",
    h1: "We tell you what the evidence shows, and we say so plainly when there isn't any.",
    intro:
      "A lot of Upwork advice is made of confident claims that nobody can check: secret algorithm tricks, guaranteed job counts, promises to make you \"rank #1\". We work by a different rule, and it applies to every audit, proposal and report we produce.",
    problems: [
      { title: "Advice you can't check", body: "Nobody can prove or disprove a tip about how Upwork's search \"really\" works. You follow it, things change or they don't, and you never find out whether the tip had anything to do with it." },
      { title: "Guarantees nobody can keep", body: "No agency controls a client's hiring decision. When someone promises you a number of jobs, they're either taking credit for luck or giving you a sales line." },
      { title: "Recommendations that come without a reason", body: "\"Change your headline\" is an instruction. \"Your headline lists tools and never names the buyer, and here's the line\" is a finding you can check for yourself." },
    ],
    strategy: [
      { title: "We tie every finding to something on the page", body: "Each point in an audit names the part of your profile it's based on. If you disagree, you can look at exactly what we looked at.", change: "You can check our reasoning for yourself." },
      { title: "We leave out what we can't verify", body: "If we can't assess a point from the evidence we have, we mark it unverified and keep it out of the score. We don't fill the gap with a guess that sounds reasonable.", change: "Your score reflects what's on your profile and nothing we assumed." },
      { title: "We report what happened", body: "Reports show real counts, such as proposals sent and replies received. We don't turn them into forecasts of income or of how many jobs you'll win.", change: "You plan from real numbers." },
      { title: "We change one thing, then look", body: "Where we can, we make changes in a way that lets us see what they did. That means trying a new opening line across a batch of proposals before changing anything else.", change: "You find out what works for your account." },
    ],
    deliverables: [
      "Audits where every finding names its evidence",
      "Unverified points marked and left out of the score",
      "Reports that separate \"measured\" from \"not provided\"",
      "A written statement that we don't promise rankings, jobs or earnings",
    ],
    measures: ["The share of findings backed by something on the profile", "Points marked unverified", "Changes we tested and what we saw"],
    faqs: [
      { q: "Isn't a guarantee more reassuring?", a: "Only until it isn't met. We'd sooner tell you what we'll do and show you what came of it than sell you a number we can't control." },
      { q: "Does this make the work slower?", a: "It makes it a little more careful. Checking a finding against the profile takes a few minutes, and acting on a wrong guess can cost you weeks." },
    ],
  },
];

const BY_SLUG = new Map(SERVICES.map(s => [s.slug, s]));
export const getService = (slug: string) => BY_SLUG.get(slug);
