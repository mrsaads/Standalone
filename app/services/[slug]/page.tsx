import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { SERVICES, getService } from "@/lib/marketing/services";
import { breadcrumbSchema, faqSchema, serviceSchema } from "@/lib/marketing/schema";
import { OG_IMAGES, SITE_NAME } from "@/lib/marketing/site";
import { SiteNav } from "@/app/marketing/site-nav";
import { SiteFooter } from "@/app/marketing/site-footer";
import { LeadForm } from "@/app/marketing/lead-form";
import { JsonLd } from "@/app/marketing/json-ld";
import { ServiceIcon } from "@/app/marketing/service-icon";
import "@/app/landing.css";
import "@/app/marketing/marketing.css";

// One screen per tile on the landing page's "What we help with" grid. Each answers the question a
// visitor arrives with — "how would this actually improve my work?" — as a strategy in order:
// what is going wrong now, what we do about it step by step, and what changes for them at each step.

export const dynamicParams = false;
export function generateStaticParams() {
  return SERVICES.map(service => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const service = getService((await params).slug);
  if (!service) return {};
  const path = `/services/${service.slug}`;
  return {
    title: service.seoTitle,
    description: service.seoDescription,
    alternates: { canonical: path },
    openGraph: { type: "article", siteName: SITE_NAME, url: path, title: `${service.seoTitle} | Improvexus`, description: service.seoDescription, images: OG_IMAGES },
    twitter: { card: "summary_large_image", title: `${service.seoTitle} | Improvexus`, description: service.seoDescription, images: ["/opengraph-image"] },
  };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const service = getService((await params).slug);
  if (!service) notFound();
  const path = `/services/${service.slug}`;
  const others = SERVICES.filter(s => s.slug !== service.slug);

  return (
    <div className="ix-landing">
      <JsonLd data={[
        serviceSchema(service),
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }, { name: service.title, path }]),
        faqSchema(service.faqs),
      ]} />
      <SiteNav />
      <main className="ix-m-main">
        <header className="ix-m-hero">
          <ol className="ix-m-crumbs" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li><Link href="/services">Services</Link></li>
            <li aria-current="page">{service.title}</li>
          </ol>
          <span className="ix-l-eyebrow"><ServiceIcon name={service.icon} size={13} /> {service.eyebrow}</span>
          <h1>{service.h1}</h1>
          <p className="ix-m-lede">{service.intro}</p>
          <div className="ix-l-hero-ctas">
            <a href="#enquiry" className="ix-l-btn-solid">Talk to us about this <ArrowRight size={15} style={{ display: "inline", marginLeft: 4, verticalAlign: -2 }} /></a>
            <Link href="/signup?destination=audit" className="ix-l-btn-ghost" style={{ border: "1px solid var(--ix-l-border)" }}>Audit my profile first</Link>
          </div>
        </header>

        <section className="ix-l-section" aria-labelledby="ix-problems">
          <div className="ix-l-section-head">
            <span>WHERE THINGS STAND TODAY</span>
            <h2 id="ix-problems">What&apos;s usually holding you back.</h2>
          </div>
          <div className={service.problems.length === 4 ? "ix-l-grid-2" : "ix-l-grid-3"}>
            {service.problems.map(problem => (
              <div className="ix-l-card" key={problem.title}>
                <h3 style={{ marginTop: 0 }}>{problem.title}</h3>
                <p>{problem.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ix-l-section" aria-labelledby="ix-strategy">
          <div className="ix-l-section-head">
            <span>THE STRATEGY</span>
            <h2 id="ix-strategy">How we improve your work, step by step.</h2>
            <p>Under each step we tell you what changes in your own working week.</p>
          </div>
          <ol className="ix-m-strategy">
            {service.strategy.map(step => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <p className="ix-m-change"><b>What changes for you</b>{step.change}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="ix-l-section" aria-labelledby="ix-get">
          <div className="ix-l-section-head">
            <span>WHAT YOU RECEIVE</span>
            <h2 id="ix-get">What you get, and how we check it worked.</h2>
          </div>
          <div className="ix-m-two">
            <div className="ix-m-panel">
              <h3>What you get</h3>
              <ul className="ix-m-checks">
                {service.deliverables.map(item => <li key={item}><Check size={15} aria-hidden="true" /><span>{item}</span></li>)}
              </ul>
            </div>
            <div className="ix-m-panel">
              <h3>What we track</h3>
              <ul className="ix-m-checks">
                {service.measures.map(item => <li key={item}><Check size={15} aria-hidden="true" /><span>{item}</span></li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="ix-l-section" aria-labelledby="ix-faq">
          <div className="ix-l-section-head">
            <span>QUESTIONS</span>
            <h2 id="ix-faq">Questions people ask us.</h2>
          </div>
          <div className="ix-m-faq">
            {service.faqs.map(faq => (
              <details key={faq.q}>
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="ix-l-section" aria-labelledby="ix-start">
          <div className="ix-l-work-grid">
            <div>
              <div className="ix-l-section-head" style={{ marginBottom: 20 }}>
                <span>START HERE</span>
                <h2 id="ix-start">Tell us where you&apos;re stuck.</h2>
                <p>Send your profile link and what you want to improve. We read your profile before we reply, so the first answer you get is about your own account.</p>
              </div>
              <p className="ix-l-footer-head">Other ways we help</p>
              <ul className="ix-m-chips">
                {others.map(other => <li key={other.slug}><Link href={`/services/${other.slug}`}>{other.title}</Link></li>)}
              </ul>
            </div>
            <LeadForm source="landing_service" sourcePage={path} cta="Send my enquiry" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
