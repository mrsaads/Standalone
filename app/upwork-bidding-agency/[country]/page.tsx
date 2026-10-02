import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { COUNTRIES, LOCATIONS_BASE, cityPath, countryPath, getCountry, regionsOf } from "@/lib/marketing/locations";
import { breadcrumbSchema, faqSchema, localServiceSchema } from "@/lib/marketing/schema";
import { OG_IMAGES, SITE_NAME, fitDescription, fitTitle } from "@/lib/marketing/site";
import { formatUtcOffset, utcOffsetMinutes } from "@/lib/marketing/time";
import { SiteNav } from "@/app/marketing/site-nav";
import { SiteFooter } from "@/app/marketing/site-footer";
import { LeadForm } from "@/app/marketing/lead-form";
import { JsonLd } from "@/app/marketing/json-ld";
import { BIDDER_POINTS, MarketTable, ServiceChips, teamSentence, timingParagraph } from "@/app/marketing/location-parts";
import "@/app/landing.css";
import "@/app/marketing/marketing.css";

// Time-zone facts on this page change with daylight saving; regenerate once a day.
export const revalidate = 86400;
export const dynamicParams = false;
export function generateStaticParams() {
  return COUNTRIES.map(country => ({ country: country.slug }));
}

const describe = (short: string) => fitDescription([
  `An Upwork bidding agency for freelancers and agencies in ${short}. You get a dedicated Upwork bidder, proposals written to the brief and a weekly report.`,
  `An Upwork bidding agency for freelancers and agencies in ${short}. You get a dedicated bidder, proposals written to the brief and a weekly report.`,
  `An Upwork bidding agency for freelancers in ${short}. You get a dedicated bidder, proposals written to the brief and a weekly report.`,
]);

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const country = getCountry((await params).country);
  if (!country) return {};
  const title = fitTitle([
    `Upwork Bidding Agency in ${country.short} | Upwork Bidders | Improvexus`,
    `Upwork Bidding Agency in ${country.short} | Improvexus`,
    `Upwork Bidding Agency in ${country.name} | Improvexus`,
  ]);
  const description = describe(country.short);
  const path = countryPath(country);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title, description, images: OG_IMAGES },
    other: { "geo.region": country.iso, "geo.placename": country.name },
  };
}

export default async function CountryPage({ params }: { params: Promise<{ country: string }> }) {
  const country = getCountry((await params).country);
  if (!country) notFound();
  const now = new Date();
  const path = countryPath(country);
  const main = country.cities[0];
  const regions = regionsOf(country);
  const zones = [...new Set(country.cities.map(city => formatUtcOffset(utcOffsetMinutes(city.tz, now))))];
  const faqs = [
    { q: `Do you work with freelancers and agencies in ${country.short}?`, a: `Yes. We work remotely with freelancers and agencies across ${country.short}, including ${country.cities.slice(0, 4).map(city => city.name).join(", ")}${country.cities.length > 4 ? " and more" : ""}. ${teamSentence(main.name, main.tz, now)}` },
    { q: `Do you have an office in ${country.short}?`, a: country.iso === "PK" ? "Improvexus is based in Pakistan and we run every engagement online. Your targeting, proposals and weekly reports are all in your client portal, so it makes no difference where in the country you are." : `No. Improvexus is based in Pakistan and works with clients in ${country.short} remotely. We handle the targeting, the proposals and the weekly reports online. We'd sooner tell you that plainly than pretend to be around the corner.` },
    { q: "Do you guarantee jobs?", a: "No. The hiring decision is the client's and nobody can promise it. What we commit to is the work, which means the targeting, the proposals and a weekly record, and we show you what came of it." },
  ];
  const description = describe(country.short);

  return (
    <div className="ix-landing">
      <JsonLd data={[
        localServiceSchema({ name: `Upwork bidding agency in ${country.short}`, description, path, areas: [{ type: "Country", name: country.name }] }),
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Upwork bidding agency", path: LOCATIONS_BASE }, { name: country.name, path }]),
        faqSchema(faqs),
      ]} />
      <SiteNav />
      <main className="ix-m-main">
        <header className="ix-m-hero">
          <ol className="ix-m-crumbs" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li><Link href={LOCATIONS_BASE}>Upwork bidding agency</Link></li>
            <li aria-current="page">{country.name}</li>
          </ol>
          <span className="ix-l-eyebrow">UPWORK BIDDING AGENCY IN {country.name.toUpperCase()}</span>
          <h1>Upwork bidding agency for freelancers and agencies in {country.short}.</h1>
          <p className="ix-m-lede">You get a dedicated Upwork bidder for your account. We choose jobs using a targeting profile we agree with you, write each proposal to the client&apos;s brief and send you a weekly report of what went out and what happened.</p>
          <div className="ix-l-hero-ctas">
            <a href="#enquiry" className="ix-l-btn-solid">Talk to a bidder <ArrowRight size={15} style={{ display: "inline", marginLeft: 4, verticalAlign: -2 }} /></a>
            <Link href="/signup?destination=audit" className="ix-l-btn-ghost" style={{ border: "1px solid var(--ix-l-border)" }}>Audit my profile first</Link>
          </div>
        </header>

        <section className="ix-l-section" aria-labelledby="ix-context">
          <div className="ix-l-section-head">
            <span>BIDDING FROM {country.name.toUpperCase()}</span>
            <h2 id="ix-context">What&apos;s different about bidding on Upwork from {country.short}.</h2>
          </div>
          <dl className="ix-m-facts">
            <div className="ix-m-fact"><dt>Time {zones.length === 1 ? "zone" : "zones"}</dt><dd>{zones.join(", ")}</dd></div>
            <div className="ix-m-fact"><dt>Local currency</dt><dd>{country.currency}</dd></div>
            <div className="ix-m-fact"><dt>Cities covered</dt><dd>{country.cities.length}</dd></div>
            <div className="ix-m-fact"><dt>How we work</dt><dd>Remotely, online</dd></div>
          </dl>
          <div className="ix-m-prose" style={{ marginTop: 24 }}>
            {country.context.map(paragraph => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}
          </div>
        </section>

        <section className="ix-l-section" aria-labelledby="ix-clock">
          <div className="ix-l-section-head">
            <span>THE CLOCK</span>
            <h2 id="ix-clock">When clients start work, in {main.name} time.</h2>
            <p>{timingParagraph(main.name, main.tz, now)} {teamSentence(main.name, main.tz, now)}</p>
          </div>
          <MarketTable placeName={main.name} tz={main.tz} at={now} />
        </section>

        <section className="ix-l-section" aria-labelledby="ix-cities">
          <div className="ix-l-section-head">
            <span>CITIES</span>
            <h2 id="ix-cities">Upwork bidders for every major city in {country.short}.</h2>
            <p>The cities are grouped by {country.regionWord}. Each city page tells you what its freelancers are known for, how that changes the bid and when the main client markets start work in local time.</p>
          </div>
          <div className="ix-m-places">
            {regions.map(group => (
              <div className="ix-m-place-card" key={group.region}>
                <h3>{group.region}</h3>
                <p>{group.cities.length} {group.cities.length === 1 ? "city" : "cities"}</p>
                <ul className="ix-m-chips">
                  {group.cities.map(city => <li key={city.slug}><Link href={cityPath(country, city)}>Upwork bidder in {city.name}</Link></li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="ix-l-section" aria-labelledby="ix-bidder">
          <div className="ix-l-section-head">
            <span>WHAT YOU GET</span>
            <h2 id="ix-bidder">What a dedicated Upwork bidder does for you.</h2>
          </div>
          <div className="ix-l-grid-2">
            {BIDDER_POINTS.map(point => (
              <div className="ix-l-card" key={point.title}>
                <h3 style={{ marginTop: 0 }}>{point.title}</h3>
                <p>{point.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ix-l-section" aria-labelledby="ix-faq">
          <div className="ix-l-section-head"><span>QUESTIONS</span><h2 id="ix-faq">Questions people ask us.</h2></div>
          <div className="ix-m-faq">
            {faqs.map(faq => <details key={faq.q}><summary>{faq.q}</summary><p>{faq.a}</p></details>)}
          </div>
        </section>

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
