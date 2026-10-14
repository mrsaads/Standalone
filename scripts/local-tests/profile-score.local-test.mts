// The free profile score: parsing the public Upwork header, the deterministic track-record points,
// the measured overview facts, the sanitizing of the model's answer, and request validation.
// No network, no database, no AI. Run: npm run test:local:profile-score
import assert from "node:assert/strict";
import { parsePublicProfile } from "../../lib/upwork-fetch";
import {
  assembleResult, measureOverview, measureTitle, parseAiScores, scoreTrackRecord, validateScoreRequest, SCORE_SECTIONS, SCORING_INSTRUCTIONS,
} from "../../lib/profile-score";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`ok - ${name}`); };

// Shaped like the signed-out Upwork page seen on 2026-10-14 for one of the benchmark profiles:
// meta tags, header text, stats. No overview, skills, portfolio or employment (Upwork hides them).
const BENCHMARK_HTML = `<!doctype html><html><head>
<title>Mateen A. - #1 Award-Winning Shopify Plus CRO Strategist | Shopify App Developer - Upwork Freelancer from Islamabad, Pakistan</title>
<meta property="og:title" content="Mateen A.">
<meta property="og:description" content="#1 Award-Winning Shopify Plus CRO Strategist | Shopify App Developer">
<meta name="description" content="View Mateen A. profile on Upwork, the world's work marketplace. Mateen has completed 28 jobs on Upwork.">
<meta property="product:price:amount" content="35"><meta property="product:price:currency" content="USD">
<script>window.__STATE__={"a":1}</script></head><body>
<nav>Find talent Find work Why Upwork Log in Sign up</nav>
<main><h2>Mateen A.</h2><span>Islamabad, Pakistan</span><span>2:55 pm local time</span>
<div>100% Job Success</div><div>Top Rated Plus</div><p>Top Rated Plus talent is highly rated for work on large contracts.</p>
<div>4.9 (14)</div><div><strong>28</strong> Total jobs</div><div><strong>3.4K</strong> Total hours</div>
<div>Book a consultation $5 per 30 min video meeting</div></main></body></html>`;

check("benchmark header is parsed field by field", () => {
  const s = parsePublicProfile(BENCHMARK_HTML);
  assert.equal(s.name, "Mateen A.");
  assert.equal(s.title, "#1 Award-Winning Shopify Plus CRO Strategist | Shopify App Developer");
  assert.equal(s.location, "Islamabad, Pakistan");
  assert.equal(s.jss, 100);
  assert.equal(s.badge, "Top Rated Plus");
  assert.equal(s.rating, 4.9);
  assert.equal(s.reviews, 14);
  assert.equal(s.totalJobs, 28);
  assert.equal(s.totalHours, 3400);
  assert.equal(s.hourlyRate, 35);
  assert.deepEqual(s.consultation, { price: 5, minutes: 30 });
});

check("title falls back to the <title> tag, an apostrophe in a meta value survives", () => {
  const html = `<title>Ali K. - Shopify Developer | Store Setup - Upwork Freelancer from Lahore, Pakistan</title><meta content="Ali's Shopify work" property="og:description">`;
  const s = parsePublicProfile(html);
  assert.equal(s.name, "Ali K.");
  assert.equal(s.title, "Ali's Shopify work");
  assert.equal(s.location, "Lahore, Pakistan");
  const noMeta = parsePublicProfile(`<title>Ali K. - Shopify Developer | Store Setup - Upwork Freelancer from Lahore, Pakistan</title>`);
  assert.equal(noMeta.title, "Shopify Developer | Store Setup");
});

check("a page with no stats leaves every stat null instead of guessing", () => {
  const s = parsePublicProfile("<title>Upwork</title><body>Log in to continue</body>");
  assert.equal(s.jss, null); assert.equal(s.badge, null); assert.equal(s.totalJobs, null); assert.equal(s.hourlyRate, null);
});

check("track record: both benchmark profiles score as expected, out of 25", () => {
  const mateen = scoreTrackRecord(parsePublicProfile(BENCHMARK_HTML))!;
  assert.equal(mateen.points, 25); assert.equal(mateen.max, 25);
  // Ameer U.: 100% JSS, no badge, 4.3 (10), 13 jobs, 1.2K hours.
  const ameer = scoreTrackRecord({ name: "Ameer U.", title: "x", location: null, jss: 100, badge: null, rating: 4.3, reviews: 10, totalJobs: 13, totalHours: 1200, hourlyRate: 35, consultation: null })!;
  assert.equal(ameer.points, 8 + 0 + 2 + 3 + 3);
});

check("track record: a brand-new profile is not punished for a missing Job Success", () => {
  const fresh = scoreTrackRecord({ name: null, title: "x", location: null, jss: null, badge: null, rating: null, reviews: null, totalJobs: 0, totalHours: 0, hourlyRate: 10, consultation: null })!;
  assert.equal(fresh.lines[0].points, 3);
  assert.match(fresh.note, /New profiles/);
  assert.equal(scoreTrackRecord({ name: null, title: "x", location: null, jss: null, badge: null, rating: null, reviews: null, totalJobs: null, totalHours: null, hourlyRate: null, consultation: null }), null);
});

check("section maximums add up to exactly 100", () => {
  assert.equal(SCORE_SECTIONS.reduce((a, s) => a + s.max, 0), 100);
});

check("title and overview are measured in code, not left to the model", () => {
  const t = measureTitle("Passionate   Web Developer | WordPress | Shopify");
  assert.equal(t.chars, 46); assert.equal(t.segments, 3); assert.deepEqual(t.fillerWords, ["passionate"]);
  const o = measureOverview("Hi, I am Ali.\n\nI build Shopify stores for 40+ brands.\n- Theme setup\n- Speed fixes\n\nSend me your store link and we can discuss the next step.");
  assert.equal(o.opensWithSelfIntro, true);
  assert.equal(o.bulletLines, 2);
  assert.equal(o.paragraphs, 3);
  assert.ok(o.numberMentions >= 1);
  assert.equal(o.endsWithInvitation, true);
});

const goodAnswer = JSON.stringify({
  title: { points: 18, note: "Clear niche and role." }, hook: { points: 40, note: "Opens with a greeting — not the client." },
  flow: { points: -3, note: "Too short." }, proof: { points: "7", note: "Some numbers." }, keywords: { points: 6.6, note: "One niche." },
  cta: { points: 2, note: "Generic contact line." }, topFlaws: ["a", "b", "c", "d"], strengths: ["x"],
});

check("model answer: points clamped to each section, dashes removed, flaws capped at three", () => {
  const ai = parseAiScores("```json\n" + goodAnswer + "\n```")!;
  assert.equal(ai.sections.hook.points, 15);   // 40 clamped to the 15 maximum
  assert.equal(ai.sections.flow.points, 0);    // negative clamped to 0
  assert.equal(ai.sections.proof.points, 7);   // "7" coerced
  assert.equal(ai.sections.keywords.points, 7);
  assert.ok(!/[–—]/.test(ai.sections.hook.note));
  assert.equal(ai.topFlaws.length, 3);
});

check("model answer: prose around the JSON is tolerated, garbage returns null", () => {
  assert.ok(parseAiScores(`Here you go: ${goodAnswer} Thanks`));
  assert.equal(parseAiScores("I can't score this."), null);
  assert.equal(parseAiScores(`{"title": 5}`), null);
});

check("result: score is scaled over what could be checked, unread parts marked not checked", () => {
  const ai = parseAiScores(goodAnswer)!;
  const om = measureOverview("x".repeat(400));
  const full = assembleResult(parsePublicProfile(BENCHMARK_HTML), ai, om);
  assert.equal(full.assessedPoints, 100);
  const earned = 18 + 25 + 15 + 0 + 7 + 7 + 2;
  assert.equal(full.score, earned);
  const noFetch = assembleResult(null, ai, om);
  assert.equal(noFetch.assessedPoints, 55); // title (20) and track record (25) not readable
  assert.equal(noFetch.sections.find(s => s.id === "track")!.checked, false);
  assert.equal(noFetch.sections.find(s => s.id === "title")!.points, null);
  assert.equal(noFetch.score, Math.round(((15 + 0 + 7 + 7 + 2) / 55) * 100));
});

const validBase = {
  submissionId: "3b241101-e2bb-4255-8caf-4136c566a962", profileUrl: "www.upwork.com/freelancers/~01114e6fd03a39f726",
  overview: "I help Shopify brands raise conversion. ".repeat(6), email: " Buddy@Example.com ",
  whatsappCountry: "PK", whatsappNumber: "0300 1234567", consent: true, website: "",
};

check("request: a valid request is normalized (https added, email lowercased, trunk 0 dropped)", () => {
  const r = validateScoreRequest(validBase);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.profileUrl, "https://www.upwork.com/freelancers/~01114e6fd03a39f726");
    assert.equal(r.value.email, "buddy@example.com");
    assert.equal(r.value.whatsapp, "+92 3001234567");
    assert.equal(r.value.honeypot, false);
  }
});

check("request: every required field is enforced on the server", () => {
  const r = validateScoreRequest({ ...validBase, profileUrl: "https://www.upwork.com/agencies/x", overview: "too short", email: "nope", whatsappNumber: "", consent: false });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.fields).sort(), ["consent", "email", "overview", "profileUrl", "whatsapp"]);
  assert.equal(validateScoreRequest({ ...validBase, extra: 1 }).ok, false);
});

check("prompt treats the profile as untrusted data and asks for JSON only", () => {
  assert.match(SCORING_INSTRUCTIONS, /untrusted data/);
  assert.match(SCORING_INSTRUCTIONS, /Return exactly this JSON object/);
});

console.log(`\n${passed} checks passed`);
