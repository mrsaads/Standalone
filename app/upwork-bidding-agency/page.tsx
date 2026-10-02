import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { COUNTRIES, LOCATIONS_BASE, TOTAL_CITIES, countryPath, cityPath } from "@/lib/marketing/locations";
import { breadcrumbSchema, localServiceSchema } from "@/lib/marketing/schema";
import { OG_IMAGES, SITE_NAME } from "@/lib/marketing/site";
import { SiteNav } from "@/app/marketing/site-nav";
import { SiteFooter } from "@/app/marketing/site-footer";
import { LeadForm } from "@/app/marketing/lead-form";
import { JsonLd } from "@/app/marketing/json-ld";
import { BIDDER_POINTS, ServiceChips } from "@/app/marketing/location-parts";
import "@/app/landing.css";
import "@/app/marketing/marketing.css";

const TITLE = "Upwork Bidding Agency: Hire an Upwork Bidder";
const DESCRIPTION = `Need a top Upwork bidder or an Upwork bidding agency? Improvexus picks the right jobs, writes each proposal to the brief and reports weekly in ${COUNTRIES.length} countries.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: LOCATIONS_BASE },
  openGraph: { type: "website", siteName: SITE_NAME, url: LOCATIONS_BASE, title: `${TITLE} | Improvexus`, description: DESCRIPTION, images: OG_IMAGES },
};

export default function LocationsHubPage() {
  return (
    <div className="ix-landing">
      <JsonLd data={[
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Upwork bidding agency", path: LOCATIONS_BASE }]),
        localServiceSchema({ name: "Upwork bidding agency", description: DESCRIPTION, path: LOCATIONS_BASE, areas: COUNTRIES.map(country => ({ type: "Country" as const, name: country.name })) }),
      ]} />
      <SiteNav />
      <main className="ix-m-main">
        <header className="ix-m-hero">
          <ol className="ix-m-crumbs" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li aria-current="page">Upwork bidding agency</li>
          </ol>
          <span className="ix-l-eyebrow">UPWORK BIDDING AGENCY</span>
          <h1>An Upwork bidding agency for freelancers and agencies, wherever you work.</h1>
          <p className="ix-m-lede">Improvexus gives you a dedicated Upwork bidder who picks the right jobs, gets to them while they&apos;re new and writes each proposal to the client&apos;s own brief. Every week you see what was sent and what happened. We work remotely with clients in {COUNTRIES.length} countries and {TOTAL_CITIES} cities.</p>
          <div className="ix-l-hero-ctas">
            <a href="#enquiry" className="ix-l-btn-solid">Talk to a bidder <ArrowRight size={15} style={{ display: "inline", marginLeft: 4, verticalAlign: -2 }} /></a>
            <Link href="/services/upwork-bidding-proposal-support" className="ix-l-btn-ghost" style={{ border: "1px solid var(--ix-l-border)" }}>How our bidding works</Link>
          </div>
        </header>

        <section className="ix-l-section" aria-labelledby="ix-top">
          <div className="ix-l-section-head">
            <span>WHAT GOOD BIDDING LOOKS LIKE</span>
            <h2 id="ix-top">What top Upwork bidders do differently.</h2>
            <p>They don&apos;t send more proposals than everyone else, and they don&apos;t have a magic template. They do these four things every day.</p>
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

        <section className="ix-l-section" aria-labelledby="ix-where">
          <div className="ix-l-section-head">
            <span>WHERE WE WORK</span>
            <h2 id="ix-where">Find your country and city.</h2>
            <p>How hard it is to bid on Upwork depends a lot on your time zone. Each page shows when the main client markets start work in your local time and what that means for your account.</p>
          </div>
          <div className="ix-m-places">
            {COUNTRIES.map(country => (
              <div className="ix-m-place-card" key={country.slug}>
                <h3><Link href={countryPath(country)}>Upwork bidding agency in {country.short}</Link></h3>
                <p>{country.cities.length} {country.cities.length === 1 ? "city" : "cities"}</p>
                <ul className="ix-m-chips">
                  {country.cities.map(city => <li key={city.slug}><Link href={cityPath(country, city)}>{city.name}</Link></li>)}
                </ul>
              </div>
            ))}
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
            <LeadForm source="landing_location" sourcePage={LOCATIONS_BASE} cta="Send my enquiry" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
