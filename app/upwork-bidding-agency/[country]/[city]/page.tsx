import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { COUNTRIES, LOCATIONS_BASE, type City, type Country, cityIsIndexable, cityPath, countryPath, distanceKm, getCity, getCountry } from "@/lib/marketing/locations";
import { WORK, cityNote } from "@/lib/marketing/city-notes";
import { breadcrumbSchema, faqSchema, localServiceSchema } from "@/lib/marketing/schema";
import { OG_IMAGES, SITE_NAME, fitDescription, fitTitle } from "@/lib/marketing/site";
import { formatUtcOffset, utcOffsetMinutes } from "@/lib/marketing/time";
import { SiteNav } from "@/app/marketing/site-nav";
import { SiteFooter } from "@/app/marketing/site-footer";
import { LeadForm } from "@/app/marketing/lead-form";
import { JsonLd } from "@/app/marketing/json-ld";
import { MarketTable, ServiceChips, teamSentence, tidy, timingParagraph } from "@/app/marketing/location-parts";
import "@/app/landing.css";
import "@/app/marketing/marketing.css";

export const revalidate = 86400;
export const dynamicParams = false;
export function generateStaticParams() {
  return COUNTRIES.flatMap(country => country.cities.map(city => ({ country: country.slug, city: city.slug })));
}

type Params = { country: string; city: string };
const placeLine = (city: string, region: string, country: string) => (region === city ? `${city}, ${country}` : `${city}, ${region}, ${country}`);
const listOf = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
// Two cities share a name (Hyderabad in Pakistan and in India). Those carry the country wherever the
// name stands alone — title, H1, description — so no two pages on the site read the same.
function displayName(country: Country, city: City): string {
  const ambiguous = COUNTRIES.some(other => other.slug !== country.slug && other.cities.some(c => c.name === city.name));
  return ambiguous ? `${city.name}, ${country.name}` : city.name;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { country: countrySlug, city: citySlug } = await params;
  const country = getCountry(countrySlug);
  const city = country && getCity(country, citySlug);
  if (!country || !city) return {};
  const shown = displayName(country, city);
  const note = cityNote(country.slug, city.slug);
  const title = fitTitle([
    `Upwork Bidder in ${shown} | Upwork Bidding Agency · Improvexus`,
    `Upwork Bidder in ${shown} | Improvexus Bidding Agency`,
    `Upwork Bidder in ${shown} | Improvexus`,
  ]);
  // The description names what this city's freelancers actually sell, so no two cities share one.
  const kinds = note ? listOf(note.work.map(key => WORK[key].short)) : "";
  const description = fitDescription([
    ...(note ? [
      `Top Upwork bidder for ${shown} freelancers and agencies in ${kinds}. Targeted proposals and weekly reports from Improvexus, an Upwork bidding agency.`,
      `Upwork bidder for ${shown} freelancers and agencies in ${kinds}. Targeted proposals and weekly reports from Improvexus.`,
      `Upwork bidder for ${shown} freelancers in ${kinds}. Targeted proposals, weekly reports. Improvexus.`,
      `Upwork bidder for ${shown} freelancers in ${kinds}. Improvexus bidding agency.`,
    ] : []),
    `Looking for a top Upwork bidder in ${shown}? Improvexus is an Upwork bidding agency for freelancers and agencies in ${city.name}.`,
  ]);
  const path = cityPath(country, city);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    ...(cityIsIndexable(country, city) ? {} : { robots: { index: false, follow: true } }),
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title, description, images: OG_IMAGES },
    other: {
      "geo.region": country.iso,
      "geo.placename": `${city.name}, ${city.region}`,
      "geo.position": `${city.lat};${city.lng}`,
      ICBM: `${city.lat}, ${city.lng}`,
    },
  };
}

export default async function CityPage({ params }: { params: Promise<Params> }) {
  const { country: countrySlug, city: citySlug } = await params;
  const country = getCountry(countrySlug);
  const city = country && getCity(country, citySlug);
  if (!country || !city) notFound();
  const now = new Date();
  const path = cityPath(country, city);
  const place = placeLine(city.name, city.region, country.name);
  const shown = displayName(country, city);
  const note = cityNote(country.slug, city.slug);
  const work = note ? note.work.map(key => WORK[key]) : [];
  // The cities that are actually closest, with the distance — not an alphabetical dump of the country.
  const nearest = country.cities
    .filter(other => other.slug !== city.slug)
    .map(other => ({ other, km: distanceKm(city, other) }))
    .sort((x, y) => x.km - y.km);
  const description = work.length
    ? `Upwork bidding agency for freelancers and agencies in ${place}, covering ${listOf(work.map(w => w.short))}.`
    : `Upwork bidding agency for freelancers and agencies in ${place}.`;
  const faqs = [
    { q: `Do you work with freelancers in ${shown}?`, a: `Yes. We work remotely with freelancers and agencies in ${city.name} and across ${country.short}. ${teamSentence(city.name, city.tz, now)} Targeting, proposals and weekly reports are all handled online.` },
    ...(work.length ? [{ q: `What kind of work do you bid for from ${city.name}?`, a: `Any category you sell on Upwork. The work most associated with ${city.name} is ${listOf(work.map(w => w.short))}, and each is bid differently: ${work[0].short} proposals, for example, are judged like this — ${work[0].screen.charAt(0).toLowerCase()}${work[0].screen.slice(1)}` }] : []),
    { q: `Can I visit your office in ${city.name}?`, a: `We do not have an office in ${city.name}. Improvexus is based in Pakistan and runs every engagement online, so your location does not change how we work together.` },
    { q: "How do we get started?", a: "Send the enquiry form with your Upwork profile link and what you want to improve. We read your profile first, then reply by email or WhatsApp with what we would change and how an engagement would run." },
  ].map(faq => ({ q: faq.q, a: tidy(faq.a) }));

  return (
    <div className="ix-landing">
      <JsonLd data={[
        localServiceSchema({ name: `Upwork bidding agency in ${shown}`, description, path, areas: [{ type: "City", name: city.name, containedIn: country.name, lat: city.lat, lng: city.lng }], about: work.map(w => w.label) }),
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Upwork bidding agency", path: LOCATIONS_BASE }, { name: country.name, path: countryPath(country) }, { name: city.name, path }]),
        faqSchema(faqs),
      ]} />
      <SiteNav />
      <main className="ix-m-main">
        <header className="ix-m-hero">
          <ol className="ix-m-crumbs" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li><Link href={LOCATIONS_BASE}>Upwork bidding agency</Link></li>
            <li><Link href={countryPath(country)}>{country.name}</Link></li>
            <li aria-current="page">{city.name}</li>
          </ol>
          <span className="ix-l-eyebrow">UPWORK BIDDER · {city.name.toUpperCase()}</span>
          <h1>A dedicated Upwork bidder for freelancers and agencies in {tidy(`${shown}.`)}</h1>
          <p className="ix-m-place">{place}</p>
          <p className="ix-m-lede">{work.length
            ? <>Improvexus is an Upwork bidding agency. For {city.name} freelancers selling {listOf(work.map(w => w.short))}, we pick the jobs worth your Connects, reach them while they are new, and write each proposal to the client&apos;s brief.</>
            : <>Improvexus is an Upwork bidding agency. We pick the jobs worth your Connects, reach them while they are new, and write each proposal to the client&apos;s brief.</>}</p>
          <div className="ix-l-hero-ctas">
            <a href="#enquiry" className="ix-l-btn-solid">Talk to a bidder <ArrowRight size={15} style={{ display: "inline", marginLeft: 4, verticalAlign: -2 }} /></a>
            <Link href="/services/upwork-bidding-proposal-support" className="ix-l-btn-ghost" style={{ border: "1px solid var(--ix-l-border)" }}>How our bidding works</Link>
          </div>
        </header>

        {note && (
          <section className="ix-l-section" aria-labelledby="ix-scene">
            <div className="ix-l-section-head">
              <span>FREELANCING FROM {city.name.toUpperCase()}</span>
              <h2 id="ix-scene">What {city.name} is known for, and what it means for your bid.</h2>
              <p>{note.scene}</p>
            </div>
            <div className="ix-l-grid-3">
              {work.map(w => (
                <div className="ix-l-card ix-m-work" key={w.label}>
                  <h3>{w.label}</h3>
                  <p><b>What clients screen for</b>{w.screen}</p>
                  <p><b>How we open the proposal</b>{w.open}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="ix-l-section" aria-labelledby="ix-clock">
          <div className="ix-l-section-head">
            <span>THE {city.name.toUpperCase()} CLOCK</span>
            <h2 id="ix-clock">When Upwork&apos;s clients start work, in {city.name} time.</h2>
            <p>{timingParagraph(city.name, city.tz, now)}</p>
          </div>
          <dl className="ix-m-facts">
            <div className="ix-m-fact"><dt>City</dt><dd>{city.name}</dd></div>
            <div className="ix-m-fact"><dt>{country.regionWord.charAt(0).toUpperCase() + country.regionWord.slice(1)}</dt><dd>{city.region}</dd></div>
            <div className="ix-m-fact"><dt>Time zone</dt><dd>{formatUtcOffset(utcOffsetMinutes(city.tz, now))}</dd></div>
            <div className="ix-m-fact"><dt>Local currency</dt><dd>{country.currency}</dd></div>
          </dl>
          <div style={{ marginTop: 18 }}><MarketTable placeName={city.name} tz={city.tz} at={now} /></div>
          <div className="ix-m-prose" style={{ marginTop: 22 }}>
            <p>{teamSentence(city.name, city.tz, now)} A bidder covering the hours you are not at your desk is the practical fix for the clock above — see <Link href="/services/upwork-bidding-proposal-support">how our bidding works</Link>, or how the market differs across the country in <Link href={countryPath(country)}>Upwork bidding agency in {country.short}</Link>.</p>
          </div>
        </section>

        <section className="ix-l-section" aria-labelledby="ix-faq">
          <div className="ix-l-section-head"><span>QUESTIONS</span><h2 id="ix-faq">Straight answers.</h2></div>
          <div className="ix-m-faq">
            {faqs.map(faq => <details key={faq.q}><summary>{faq.q}</summary><p>{faq.a}</p></details>)}
          </div>
        </section>

        {nearest.length > 0 && (
          <section className="ix-l-section" aria-labelledby="ix-nearby">
            <div className="ix-l-section-head">
              <span>NEARBY</span>
              <h2 id="ix-nearby">Other cities we cover in {country.short}, nearest first.</h2>
            </div>
            <ul className="ix-m-chips">
              {nearest.map(({ other, km }) => (
                <li key={other.slug}><Link href={cityPath(country, other)}>Upwork bidder in {other.name} <span>· {Math.round(km / 10) * 10 || 10} km</span></Link></li>
              ))}
            </ul>
          </section>
        )}

        <section className="ix-l-section" aria-labelledby="ix-start">
          <div className="ix-l-work-grid">
            <div>
              <div className="ix-l-section-head" style={{ marginBottom: 20 }}>
                <span>START HERE</span>
                <h2 id="ix-start">Tell us about your account.</h2>
                <p>Send your Upwork profile link and what you want to improve. We read your profile before we reply.</p>
              </div>
              <p className="ix-l-footer-head">What we help with</p>
              <ServiceChips />
            </div>
            <LeadForm source="landing_location" sourcePage={path} defaultCountry={country.iso} cta="Send my enquiry" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
