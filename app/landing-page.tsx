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
  { title: "Understand your profile, services, and goals", body: "We start from your actual profile evidence and what you're trying to achieve." },
  { title: "Identify improvements and agree on priorities", body: "A clear, prioritized list — not a generic checklist." },
  { title: "Implement, track results, and refine the approach", body: "Ongoing work stays visible through weekly reports you can check any time." },
];

export function LandingPage() {
  return (
    <div className="ix-landing">
      <SiteNav />

      <main>
      <header className="ix-l-hero" id="top">
        <div className="ix-l-hero-copy">
          <span className="ix-l-eyebrow">IMPROVEXUS · UPWORK BIDDING AGENCY</span>
          <h1>The Upwork bidding agency that builds a stronger Upwork presence.</h1>
          <p>Dedicated Upwork bidders, profile optimization, proposal support and ongoing account management — Improvexus helps freelancers and agencies approach Upwork growth with a clear plan.</p>
          <div className="ix-l-hero-ctas">
            <Link href="/signup?destination=audit" className="ix-l-btn-solid">Audit my profile <ArrowRight size={15} style={{ display: "inline", marginLeft: 4, verticalAlign: -2 }} /></Link>
            <a href="#work-with-us" className="ix-l-btn-ghost" style={{ border: "1px solid var(--ix-l-border)" }}>Explore profile management</a>
          </div>
        </div>
        <div className="ix-l-cube-slot"><AuthCube /></div>
      </header>

      <section className="ix-l-section" id="services">
        <div className="ix-l-section-head">
          <span>WHAT WE HELP WITH</span>
          <h2>Every part of showing up well on Upwork.</h2>
          <p>Findings and suggestions come from your supplied profile evidence — never guesses, and never a promise of rankings, jobs, or earnings.</p>
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
          <h2>A clear, three-step process.</h2>
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
          <p>Use the audit tool independently, any time — or work with Improvexus on an ongoing managed engagement.</p>
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
            <p>See what is working on your profile and what needs attention.</p>
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
            <p>Access your weekly reports, profile updates, documents, and payment history.</p>
            <Link href="/signup?destination=client_portal" className="ix-l-btn-solid" style={{ alignSelf: "flex-start" }}>Open client portal</Link>
          </div>
        </div>
      </section>

      <section className="ix-l-section" id="where-we-work">
        <div className="ix-l-section-head">
          <span>WHERE WE WORK</span>
          <h2>Upwork bidders for freelancers and agencies in {COUNTRIES.length} countries.</h2>
          <p>We work remotely with clients in {TOTAL_CITIES} cities. Pick your country to see when the main client markets start work in your local time — and what that means for your bidding.</p>
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
              <p>Use the audit tool independently whenever you like, or send us your profile and what you need help with — we&apos;ll review whether ongoing, managed support is a fit.</p>
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
