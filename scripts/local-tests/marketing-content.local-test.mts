// Checks on the public (search-facing) content. No database needed:
//   npx tsx scripts/local-tests/marketing-content.local-test.mts
//
// These exist because the location pages are generated from data, and the failure mode of generated
// pages is silent: add a city without its note and you have published a near-duplicate page.
import { COUNTRIES, cityIsIndexable, distanceKm } from "../../lib/marketing/locations";
import { CITY_NOTES, WORK, cityNote } from "../../lib/marketing/city-notes";
import { SERVICES } from "../../lib/marketing/services";
import { fitDescription, fitTitle } from "../../lib/marketing/site";
import { describeDifference } from "../../lib/marketing/time";

let pass = 0, fail = 0;
function assert(cond: unknown, name: string) { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } }

const cities = COUNTRIES.flatMap(country => country.cities.map(city => ({ country, city, key: `${country.slug}/${city.slug}` })));

console.log("city notes");
const missing = cities.filter(c => !cityNote(c.country.slug, c.city.slug)).map(c => c.key);
assert(missing.length === 0, `every city has a hand-written note (missing: ${missing.join(", ") || "none"})`);
const orphans = Object.keys(CITY_NOTES).filter(key => !cities.some(c => c.key === key));
assert(orphans.length === 0, `no note points at a city that does not exist (orphans: ${orphans.join(", ") || "none"})`);
const scenes = Object.values(CITY_NOTES).map(note => note.scene);
assert(new Set(scenes).size === scenes.length, "no two cities share a scene paragraph");
const words = (text: string) => text.split(/\s+/).length;
const short = Object.entries(CITY_NOTES).filter(([, note]) => words(note.scene) < 28).map(([key]) => key);
assert(short.length === 0, `every scene is a real paragraph, at least 28 words (too short: ${short.join(", ") || "none"})`);
const badWork = Object.entries(CITY_NOTES).filter(([, note]) => note.work.length !== 3 || new Set(note.work).size !== 3 || note.work.some(key => !WORK[key])).map(([key]) => key);
assert(badWork.length === 0, `every city names three distinct, known kinds of work (bad: ${badWork.join(", ") || "none"})`);
const named = Object.entries(CITY_NOTES).filter(([key, note]) => { const c = cities.find(x => x.key === key); return c && !note.scene.includes(c.city.name.replace(", D.C.", "")); }).map(([key]) => key);
assert(named.length === 0, `every scene is about its own city by name (not: ${named.join(", ") || "none"})`);
// The same three kinds of work (in any order) inside one country would give two pages the same middle section.
const clash: string[] = [];
for (const country of COUNTRIES) {
  const seen = new Map<string, string>();
  for (const city of country.cities) {
    const sig = [...(cityNote(country.slug, city.slug)?.work ?? [])].sort().join("|");
    if (seen.has(sig)) clash.push(`${seen.get(sig)} = ${city.slug}`); else seen.set(sig, city.slug);
  }
}
assert(clash.length === 0, `no two cities in one country list the same three kinds of work (${clash.join("; ") || "none"})`);
const banned = /\b(guarantee[ds]?|#1|number one|best in|top-rated)\b/i;
assert(!scenes.some(scene => banned.test(scene)) && !Object.values(WORK).some(w => banned.test(w.screen + w.open)), "no guarantees or ranking claims in the location copy");
assert(cities.every(c => cityIsIndexable(c.country, c.city)), "every city with a note is indexable by default");

console.log("titles and descriptions");
assert(fitTitle(["a".repeat(70), "b".repeat(58), "c".repeat(40)]) === "b".repeat(58), "fitTitle returns the fullest version that fits in 60 characters");
assert(fitTitle(["a".repeat(70), "b".repeat(65)]) === "b".repeat(65), "…and falls back to the shortest version rather than nothing");
assert(fitDescription(["a".repeat(200), "b".repeat(150)]) === "b".repeat(150), "fitDescription does the same at 155 characters");
assert(SERVICES.every(s => s.seoTitle.length <= 60 && s.seoDescription.length <= 160), "service titles and descriptions fit the search result");

console.log("distance");
const pk = COUNTRIES.find(c => c.slug === "pakistan")!;
const lahore = pk.cities.find(c => c.slug === "lahore")!, karachi = pk.cities.find(c => c.slug === "karachi")!, gujranwala = pk.cities.find(c => c.slug === "gujranwala")!;
const lk = distanceKm(lahore, karachi);
assert(lk > 1000 && lk < 1060, `Lahore–Karachi is about 1,030 km in a straight line (got ${Math.round(lk)})`);
assert(distanceKm(lahore, gujranwala) < 80 && distanceKm(lahore, lahore) === 0, "nearby cities come out near, and a city is 0 km from itself");

console.log("time differences");
const when = new Date("2026-10-02T12:00:00Z");
assert(describeDifference("Asia/Karachi", "Asia/Kolkata", when) === "half an hour behind", "Pakistan is 'half an hour behind' India, not '0½ hours behind'");
assert(describeDifference("Asia/Karachi", "Asia/Kathmandu", when) === "45 minutes behind", "a 45-minute difference is written in minutes");
assert(describeDifference("Asia/Karachi", "Asia/Dhaka", when) === "1 hour behind" && describeDifference("Asia/Karachi", "America/New_York", when) === "9 hours ahead of", "whole hours read normally");
assert(describeDifference("Asia/Karachi", "Asia/Karachi", when) === "the same time as", "the same zone says so");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
