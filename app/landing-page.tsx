"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AuthCube } from "@/app/auth/auth-cube";
import { SERVICES } from "@/lib/marketing/services";
import { COUNTRIES, LOCATIONS_BASE, TOTAL_CITIES, countryPath } from "@/lib/marketing/locations";
import { HOME_FAQS } from "@/lib/marketing/home-faqs";
import { SiteNav } from "@/app/marketing/site-nav";
import { SiteFooter } from "@/app/marketing/site-footer";
import { LeadForm } from "@/app/marketing/lead-form";
import { ServiceIcon } from "@/app/marketing/service-icon";
import "@/app/auth/auth-cube.css";
import "./landing.css";
import "@/app/marketing/marketing.css";

// The public landing page. The nav, footer, enquiry form, service list and FAQ all live in shared
// modules (app/marketing/*, lib/marketing/*) because the service screens and location pages use the
// same ones — one definition each, so the public site cannot contradict itself.

const STEPS = [
  { title: "We get to know your profile, services and goals", body: "We start with what's on your profile today and what you want to achieve." },
  { title: "We agree what to fix first", body: "You get a short list in order of priority, written for your profile." },
  { title: "We do the work and keep track of it", body: "You can follow the ongoing work in weekly reports and check them whenever you like." },
];

export function LandingPage() {
  return (
    <div className="ix-landing">
      <SiteNav />

      <main>
      <header className="ix-l-hero" id="top">
        <div className="ix-l-hero-copy">
          <span className="ix-l-eyebrow">IMPROVEXUS UPWORK BIDDING AGENCY</span>
          <h1>An Upwork bidding agency that helps you win better work.</h1>
          <p>We give freelancers and agencies a dedicated Upwork bidder, tidy up the profile, help with proposals and look after the account week to week, so you always know what the plan is.</p>
          <div className="ix-l-hero-ctas">
            <Link href="/profile-score" className="ix-l-btn-solid">Get my free profile score <ArrowRight size={15} style={{ display: "inline", marginLeft: 4, verticalAlign: -2 }} /></Link>
            <Link href="/signup?destination=audit" className="ix-l-btn-ghost" style={{ border: "1px solid var(--ix-l-border)" }}>Audit my profile</Link>
            <a href="#work-with-us" className="ix-l-btn-ghost" style={{ border: "1px solid var(--ix-l-border)" }}>Explore profile management</a>
          </div>
        </div>
        <div className="ix-l-cube-slot"><AuthCube /></div>
      </header>

      <section className="ix-l-section" id="services">
        <div className="ix-l-section-head">
          <span>WHAT WE HELP WITH</span>
          <h2>What we can help you with on Upwork.</h2>
          <p>Everything we suggest comes from what&apos;s on your own profile. We don&apos;t guess, and we don&apos;t promise rankings, jobs or earnings.</p>
        </div>
        <div className="ix-l-grid-3">
          {SERVICES.map(s => (
            <Link className="ix-l-card" key={s.slug} href={`/services/${s.slug}`}>
              <span className="ix-l-icon"><ServiceIcon name={s.icon} /></span>
              <h3>{s.title}</h3>
              <p>{s.tile}</p>
              <span className="ix-l-card-more">See the strategy <ArrowRight size={14} aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="ix-l-section" id="how-it-works">
        <div className="ix-l-section-head">
          <span>HOW WE WORK</span>
          <h2>How we work, in three steps.</h2>
        </div>
        <div className="ix-l-steps">
          {STEPS.map((s, i) => (
            <div className="ix-l-step" key={s.title}>
              <span>0{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ix-l-section" id="profile-audit">
        <div className="ix-l-section-head">
          <span>START HERE</span>
          <h2>Two ways to work with Improvexus.</h2>
          <p>You can use the audit tool on your own whenever you like, or you can have us manage your account on an ongoing basis.</p>
        </div>
        <div className="ix-l-workspace-cards">
          <div className="ix-l-workspace-card">
            <div className="ix-l-preview">
              <span className="ix-l-preview-label">Illustrative</span>
              <div className="ix-l-preview-row"><span>Assessed score</span><b>62%</b></div>
              <div className="ix-l-preview-row"><span>Offer clarity</span><b>Needs work</b></div>
              <div className="ix-l-preview-row"><span>Relevant work</span><b>Pass</b></div>
              <div className="ix-l-preview-row"><span>Next step</span><b>Not verified</b></div>
            </div>
            <h3>Profile Audit</h3>
            <p>See what&apos;s working on your profile and what needs attention.</p>
            <Link href="/signup?destination=audit" className="ix-l-btn-solid" style={{ alignSelf: "flex-start" }}>Start my audit</Link>
          </div>
          <div className="ix-l-workspace-card">
            <div className="ix-l-preview">
              <span className="ix-l-preview-label">Illustrative</span>
              <div className="ix-l-preview-row"><span>This week</span><b>Report ready</b></div>
              <div className="ix-l-preview-row"><span>Open items</span><b>2 for you</b></div>
              <div className="ix-l-preview-row"><span>Documents</span><b>3 shared</b></div>
              <div className="ix-l-preview-row"><span>Payment status</span><b>Up to date</b></div>
            </div>
            <h3>Client Portal</h3>
            <p>Your weekly reports, profile updates, documents and payment history, all in one place.</p>
            <Link href="/signup?destination=client_portal" className="ix-l-btn-solid" style={{ alignSelf: "flex-start" }}>Open client portal</Link>
          </div>
        </div>
      </section>

      <section className="ix-l-section" id="where-we-work">
        <div className="ix-l-section-head">
          <span>WHERE WE WORK</span>
          <h2>Upwork bidders for freelancers and agencies in {COUNTRIES.length} countries.</h2>
          <p>We work remotely with clients in {TOTAL_CITIES} cities. Pick your country to see when the main client markets start work in your local time, and what that means for your bidding.</p>
        </div>
        <ul className="ix-m-chips">
          {COUNTRIES.map(country => <li key={country.slug}><Link href={countryPath(country)}>Upwork bidding agency in {country.short}</Link></li>)}
          <li><Link href={LOCATIONS_BASE}>All countries and cities</Link></li>
        </ul>
      </section>

      <section className="ix-l-section" id="work-with-us">
        <div className="ix-l-work-grid">
          <div>
            <div className="ix-l-section-head" style={{ marginBottom: 20 }}>
              <span>WORK WITH IMPROVEXUS</span>
              <h2>Let&apos;s work on your Upwork growth.</h2>
              <p>Send us your profile link and tell us what you need help with. We&apos;ll read your profile and let you know whether managed support makes sense for you. You&apos;re also welcome to use the audit tool on your own.</p>
            </div>
            <Accordion type="single" collapsible>
              {HOME_FAQS.map(f => (
                <AccordionItem value={f.q} key={f.q}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent>{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          <LeadForm />
        </div>
      </section>
      </main>

      <SiteFooter />
    </div>
  );
}
