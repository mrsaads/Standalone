// The three flagship service pages (Upwork bidding, LinkedIn growth, email marketing). They use the
// richer layout in app/marketing/flagship.tsx; every other service keeps the standard strategy screen.
//
// The copy comes from Improvexus's own client proposals (LinkedIn Growth, Email Marketing and Business
// Development, Pakistan and International editions, 2026). Deliberately left out of the public pages:
// prices, plans and market price ranges (Buddy chose "no packages" for the site), and anything from the
// internal outreach playbook. Same house rules as services.ts: no long dashes, semicolons, slashes
// between words or stock phrases, and no promise of results. scripts/local-tests/marketing-content
// checks every string here.
//
// The problems, FAQ, SEO title and description still live on the service in services.ts, so the
// structured data and the rest of the site read the same text.

export type FlagshipAccent = "mint" | "sky" | "amber";
export type ScopeIcon = "target" | "palette" | "pen" | "chat" | "send" | "chart" | "shield" | "users" | "mail" | "zap" | "filter" | "file" | "inbox" | "workflow";

export type Flagship = {
  slug: string;
  accent: FlagshipAccent;
  heroPoints: string[];
  example: { label: string; before: string; after: string; beforeTag: string; afterTag: string };
  quote: string;
  system: { title: string; intro: string; steps: { name: string; body: string }[]; outcome: { name: string; body: string } };
  pillars: { title: string; body: string }[];
  scope: { title: string; icon: ScopeIcon; items: string[] }[];
  roadmap?: { when: string; name: string; body: string }[];
  rhythmTitle: string;
  rhythm: { when: string; body: string }[];
  measures: { title: string; items: string[] }[];
  safety: { title: string; body: string };
  freeCheck: { title: string; body: string; href: string; cta: string };
};

// Shared by all three pages: what every client gets from working with Improvexus, whatever the channel.
export const HOW_WE_WORK = {
  guarantee: {
    title: "Our activity guarantee",
    body: "We can't promise how a market will respond. We do promise the work. Every deliverable in your plan ships on schedule, and if we miss one, its value is credited against your next invoice.",
  },
  cards: [
    { title: "You own everything", body: "Content, designs, lead lists, templates and data are yours, during the engagement and after it ends." },
    { title: "Approvals in 48 hours", body: "Nothing goes live without your sign-off. Every deliverable gets two rounds of revisions." },
    { title: "Where we work from", body: "We're in Pakistan, on UTC+5. Our day overlaps UK and EU business hours, we take calls in US East Coast mornings, and calls can be in English or Urdu." },
  ],
};

export const NEXT_STEPS = (freeCheck: Flagship["freeCheck"]) => [
  { title: "Book a 30-minute fit call", body: "We learn your offer, your buyers and your goals. If we're not the right fit, we'll tell you." },
  { title: freeCheck.title, body: freeCheck.body },
  { title: "Start", body: "Onboarding begins within 3 working days of you saying yes." },
];

export const FLAGSHIPS: Flagship[] = [
  {
    slug: "upwork-bidding-proposal-support",
    accent: "mint",
    heroPoints: ["Jobs filtered against rules you agree", "Every proposal written to the client's brief", "A weekly log of every Connect spent"],
    example: {
      label: "Illustrative example: one proposal opening, rewritten",
      beforeTag: "Template opening",
      before: "Hi, I have 5 years of experience in web development and I'm the right person for this job.",
      afterTag: "Written to the brief",
      after: "Your checkout breaks when a discount code is applied. I fixed the same error on a Shopify store last month. Here's what I'd check first.",
    },
    quote: "Top bidders don't win by sending more proposals. They pick fewer jobs that fit better, get there early, and show in the first line that they read the brief.",
    system: {
      title: "One process, from the job feed to the interview",
      intro: "Bidding gets better when the same team picks the jobs, writes the proposals and reads the results every week.",
      steps: [
        { name: "Target", body: "We write down what a good job looks like for you: categories, lowest budget, client history, project size and the warning signs that mean skip." },
        { name: "Watch", body: "Our bidders cover your feed across the time zones your clients post in, so a good job gets an answer while it's still new." },
        { name: "Write", body: "Every proposal opens with the client's problem in their own words, then your closest past work, then one clear next step." },
        { name: "Review", body: "Every proposal is logged as sent, viewed, replied or interviewed. Each week we tighten the targeting from that record." },
      ],
      outcome: { name: "Interviews with the right clients", body: "Conversations handed to you to close, with a record of how each one started." },
    },
    pillars: [
      { title: "You stay in charge", body: "You approve the targeting rules and the tone. Anything outside them, like a large fixed-price bid, comes to you before it's sent." },
      { title: "Written for each job", body: "No template openings and no biography first. Each proposal is about the client's project." },
      { title: "Measured in replies", body: "We report views, replies and interviews as real counts, and change the targeting from what they show." },
    ],
    scope: [
      { title: "Targeting", icon: "filter", items: ["A written targeting profile for your account", "Categories, budget floor and client history rules", "A list of red flags that mean skip"] },
      { title: "Bidding", icon: "pen", items: ["Up to 40 proposals a month, each written to the job", "Your feed covered across your clients' time zones", "Your closest past work matched to each brief"] },
      { title: "Profile", icon: "users", items: ["Title, overview, portfolio and rate positioning", "Specialised profiles lined up behind your offers", "A free profile score before we start"] },
      { title: "Reporting", icon: "chart", items: ["A log of every proposal, the Connects spent and the status", "A weekly review of what we're changing and why", "Every report kept in your client portal"] },
    ],
    rhythmTitle: "How a week runs",
    rhythm: [
      { when: "Every day", body: "Your feed is checked across your clients' time zones, and proposals go out within the rules you approved." },
      { when: "Any time", body: "Anything outside the rules comes to you first. Conversations with clients stay with you." },
      { when: "Every week", body: "A log of every proposal and Connect spent, what came of it, and what we're changing next." },
    ],
    measures: [
      { title: "Activity", items: ["Proposals sent", "Connects spent", "Jobs skipped, and why"] },
      { title: "Response", items: ["Views and replies, as real counts", "Interviews", "Reply rate by job type"] },
      { title: "Learning", items: ["Targeting changes made", "Opening lines tested", "What we're changing next week"] },
    ],
    safety: { title: "Your account stays safe", body: "We don't ask for your password. Agencies add our bidder through Upwork's own team roles, and freelancers get the proposal text to send themselves." },
    freeCheck: { title: "Get your free profile score", body: "Paste your Upwork link and get a score out of 100, with the top three changes to make.", href: "/profile-score", cta: "Get my free score" },
  },
  {
    slug: "linkedin-growth-personal-brand",
    accent: "sky",
    heroPoints: ["A profile rebuilt for buyers", "Posts written from your own stories", "Personal outreach that earns the conversation"],
    example: {
      label: "Illustrative example: one headline, rewritten",
      beforeTag: "Job title",
      before: "CEO at [Your Company] | Entrepreneur | Visionary | Passionate about growth",
      afterTag: "Who you help",
      after: "I help logistics companies cut delivery costs with route automation | CEO, [Your Company]",
    },
    quote: "Visibility without positioning is noise. Positioning without visibility is a secret. We build both, then connect them to a pipeline.",
    system: {
      title: "One system, four engines",
      intro: "Each engine works on its own. Together they compound: a sharper profile makes your content convert, your content warms up your outreach, and your outreach fills your calendar.",
      steps: [
        { name: "Position", body: "We define your ideal client, your core offer and the one sentence you want to be known for. Everything else is built on it." },
        { name: "Design", body: "A banner, Featured graphics and a carousel system in one visual identity, so people recognise you in the feed before they read your name." },
        { name: "Publish and engage", body: "Posts written from your own stories and expertise, plus daily comments on prospects' posts, so they know you before you message them." },
        { name: "Reach out", body: "Sales Navigator lists built on buying signals, then a give, give, ask sequence that earns the right to a conversation." },
      ],
      outcome: { name: "Booked calls", body: "Qualified conversations on your calendar, tracked in a pipeline you can see." },
    },
    pillars: [
      { title: "One team, every engine", body: "Profile, content and outreach are planned together, so your message stays the same from first impression to first call." },
      { title: "Written in your voice", body: "Every post starts from a monthly interview with you. AI speeds up our research, and it never invents your opinions." },
      { title: "Measured in pipeline", body: "We report acceptance rates, replies and booked calls next to your reach and engagement. Likes alone don't pay invoices." },
    ],
    scope: [
      { title: "Profile optimization", icon: "target", items: ["A 60-minute positioning and ideal-client workshop", "Keyword research for LinkedIn and Google search", "Headline, About and Experience rewritten for buyers", "Featured section with your offer, proof and booking link", "Services page, skills, custom URL and Follow setup", "Scripts to collect real recommendations"] },
      { title: "Brand design", icon: "palette", items: ["A custom banner with your value and a call to action", "Three Featured section thumbnails", "Carousel and post templates in your brand colours", "A personal brand guide: voice, content pillars and visual rules"] },
      { title: "Content", icon: "pen", items: ["A monthly 45-minute voice interview", "A content calendar built on 3 or 4 content pillars", "Authority, proof, story and soft-pitch posts", "Carousels, cheat sheets and text posts with tested hooks", "Scheduled for your audience's most active hours"] },
      { title: "Engagement", icon: "chat", items: ["15 to 20 thoughtful comments a day on prospects' and peers' posts", "Same-day replies to comments on your own posts", "New connections welcomed with context, without a pitch"] },
      { title: "Outreach", icon: "send", items: ["Sales Navigator lists filtered by intent and buying signals", "Personal connection requests, never a name-swap template", "A give, give, ask sequence: value, value, then an invitation", "Follow-ups, reply handling and booking to your calendar"] },
      { title: "Reporting", icon: "chart", items: ["A pipeline tracker in Google Sheets or HubSpot's free CRM", "A monthly report on what moved, what didn't and what changes", "A strategy call to set next month's focus"] },
    ],
    roadmap: [
      { when: "Days 1 to 7", name: "Onboard", body: "Kickoff call, positioning workshop, first voice interview, access and tools set up." },
      { when: "Days 8 to 14", name: "Rebuild", body: "New profile live, brand assets delivered, first month's content calendar approved." },
      { when: "Days 15 to 30", name: "Launch", body: "Publishing and daily engagement begin. With outreach, the first prospect list is built and outreach starts." },
      { when: "Days 31 to 60", name: "Learn", body: "We double down on the formats and messages that perform, and cut what doesn't." },
      { when: "Days 61 to 90", name: "Scale", body: "More volume on what works, and a 90-day review with the numbers and a plan for the next quarter." },
    ],
    rhythmTitle: "Your month with us",
    rhythm: [
      { when: "Week 1", body: "Voice interview. Next month's calendar drafted from your stories and last month's best posts." },
      { when: "Week 2", body: "Posts and carousels sent to you for approval. Prospect lists refreshed." },
      { when: "Week 3", body: "Publishing, daily engagement and outreach continue, with a mid-month check on what's landing." },
      { when: "Week 4", body: "Monthly report and strategy call: what moved, what didn't, what changes next." },
    ],
    measures: [
      { title: "Visibility", items: ["Profile views", "Search appearances", "Follower growth from your target audience"] },
      { title: "Content", items: ["Impressions and engagement rate", "Saves, reposts and comments", "Comments from ideal clients"] },
      { title: "Pipeline", items: ["Connection acceptance rate", "Positive reply rate", "Calls booked and pipeline value"] },
    ],
    safety: { title: "Your account stays safe", body: "No bots, no engagement pods and no tools that break LinkedIn's rules. Outreach volume stays well inside the platform's limits." },
    freeCheck: { title: "Get a free profile audit", body: "Within 3 working days you get a one-page action plan. It's yours to keep, whatever you decide.", href: "#enquiry", cta: "Ask for my free audit" },
  },
  {
    slug: "email-marketing-cold-email",
    accent: "amber",
    heroPoints: ["Authentication fixed before the first send", "Automated flows that sell every day", "B2B cold email from separate, warmed domains"],
    example: {
      label: "Illustrative example: one subject line, rewritten",
      beforeTag: "Sent to everyone",
      before: "November Newsletter",
      afterTag: "Sent to the right person",
      after: "Your cart is still here, and free delivery ends Friday",
    },
    quote: "Social reach is rented. Your email list is owned. We run it like the asset it is.",
    system: {
      title: "One system, from inbox to revenue",
      intro: "Two lanes, one strategy. Lifecycle email turns people who already know you into buyers. Outbound email starts conversations with the ones who don't know you yet.",
      steps: [
        { name: "Authenticate", body: "SPF, DKIM and DMARC configured and monitored, so mailbox providers trust your domain before the first campaign goes out." },
        { name: "Capture", body: "Signup forms, lead magnets and welcome offers that grow your list with people who actually want to hear from you." },
        { name: "Automate", body: "Welcome, nurture, abandoned-cart, post-purchase and win-back flows that sell while you work on something else." },
        { name: "Send and prospect", body: "Planned campaigns to your list. For B2B, cold sequences to verified decision-makers from separate, warmed domains." },
      ],
      outcome: { name: "Revenue and meetings", body: "Sales from your list and meetings from outbound, reported in numbers that matter." },
    },
    pillars: [
      { title: "Deliverability first", body: "We fix authentication and list health before we write a word. Great copy in a spam folder earns nothing." },
      { title: "Built for your model", body: "E-commerce gets cart and post-purchase flows. Services and B2B get nurture and outbound. Nothing is copied between clients." },
      { title: "Measured in revenue", body: "We report clicks, conversions, revenue per recipient and meetings booked, and leave inflated open rates out of it." },
    ],
    scope: [
      { title: "Deliverability and setup", icon: "shield", items: ["SPF, DKIM and DMARC authentication", "Platform setup or migration: Klaviyo, Mailchimp, Brevo or HubSpot", "List audit, cleaning and verification", "One-click unsubscribe and consent compliance", "A branded, mobile-first template system"] },
      { title: "List growth", icon: "users", items: ["Signup forms and pop-ups for Shopify, WordPress or Webflow", "Lead magnet concept and copy", "Welcome offer strategy", "Segments by source, behaviour and customer value"] },
      { title: "Automations", icon: "workflow", items: ["A welcome series of 3 to 5 emails", "Abandoned cart and browse recovery for online stores", "A lead nurture sequence for services and B2B", "Post-purchase and review requests", "Win-back and list re-engagement"] },
      { title: "Campaigns", icon: "mail", items: ["A monthly campaign calendar tied to your offers", "Copywriting and design for every send", "Split tests on subject lines, offers and send times", "Newsletters for B2B audiences", "Copy in English or Urdu"] },
      { title: "B2B outbound", icon: "send", items: ["Separate sending domains and inboxes, warmed for 2 to 3 weeks", "Ideal-client lists with verified email addresses", "Personal sequences of 3 or 4 steps", "Reply handling and meetings booked to your calendar"] },
      { title: "Reporting", icon: "chart", items: ["Inbox placement and domain health monitoring", "Clicks, conversions and revenue per recipient", "Unsubscribe and complaint rates against safe limits", "A monthly report and strategy call"] },
    ],
    roadmap: [
      { when: "Days 1 to 7", name: "Audit", body: "Deliverability check, list health review, existing flows mapped and a revenue baseline recorded." },
      { when: "Days 8 to 21", name: "Build", body: "Authentication fixed, platform configured, templates and the first automations live." },
      { when: "Days 22 to 30", name: "Launch", body: "First campaigns sent. For outbound, domains finish warming and lists are verified." },
      { when: "Days 31 to 60", name: "Optimize", body: "Split tests on subject lines, offers and timing. Outbound sequences go live." },
      { when: "Days 61 to 90", name: "Scale", body: "New flows, deeper segments, more outbound volume on what works, and a 90-day review." },
    ],
    rhythmTitle: "Your month with us",
    rhythm: [
      { when: "Week 1", body: "Campaign calendar locked, offers confirmed, segments refreshed." },
      { when: "Week 2", body: "Campaigns written, designed and sent to you for approval. Split tests set up." },
      { when: "Week 3", body: "Sends go out. Flows checked, complaint and bounce rates reviewed." },
      { when: "Week 4", body: "Monthly report and strategy call. Next month's tests chosen." },
    ],
    measures: [
      { title: "Deliverability", items: ["Inbox placement and bounce rate", "Complaints under 0.1%, never above 0.3%", "Domain and DMARC health"] },
      { title: "Lifecycle", items: ["Click-through and conversion rate", "Revenue per recipient", "Share of revenue from automations"] },
      { title: "Outbound", items: ["Reply and positive reply rate", "Meetings booked", "Cost per meeting"] },
    ],
    safety: { title: "Your domain stays safe", body: "Cold email runs from separate domains, so your main domain's reputation is never at risk. Every list is verified before a send." },
    freeCheck: { title: "Get a free deliverability check", body: "Within 3 working days we check your domain setup and list health, and send you a one-page action plan.", href: "#enquiry", cta: "Ask for my free check" },
  },
];

const BY_SLUG = new Map(FLAGSHIPS.map(f => [f.slug, f]));
export const getFlagship = (slug: string) => BY_SLUG.get(slug);
