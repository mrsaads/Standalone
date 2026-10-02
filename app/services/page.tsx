import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SERVICES } from "@/lib/marketing/services";
import { breadcrumbSchema } from "@/lib/marketing/schema";
import { OG_IMAGES, SITE_NAME, absoluteUrl } from "@/lib/marketing/site";
import { SiteNav } from "@/app/marketing/site-nav";
import { SiteFooter } from "@/app/marketing/site-footer";
import { JsonLd } from "@/app/marketing/json-ld";
import { ServiceIcon } from "@/app/marketing/service-icon";
import "@/app/landing.css";
import "@/app/marketing/marketing.css";

const DESCRIPTION = "What Improvexus does for Upwork freelancers and agencies: profile audits, positioning, dedicated bidding, profile management and weekly reporting.";

export const metadata: Metadata = {
  title: "Upwork Bidding, Proposal & Profile Services",
  description: DESCRIPTION,
  alternates: { canonical: "/services" },
  openGraph: { type: "website", siteName: SITE_NAME, url: "/services", title: "Upwork Bidding, Proposal & Profile Services | Improvexus", description: DESCRIPTION, images: OG_IMAGES },
};

export default function ServicesIndexPage() {
  return (
    <div className="ix-landing">
      <JsonLd data={[
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }]),
        {
          "@context": "https://schema.org", "@type": "ItemList", name: "Improvexus services",
          itemListElement: SERVICES.map((service, index) => ({ "@type": "ListItem", position: index + 1, name: service.title, url: absoluteUrl(`/services/${service.slug}`) })),
        },
      ]} />
      <SiteNav />
      <main className="ix-m-main">
        <header className="ix-m-hero">
          <ol className="ix-m-crumbs" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li aria-current="page">Services</li>
          </ol>
          <span className="ix-l-eyebrow">WHAT WE HELP WITH</span>
          <h1>Every part of showing up well on Upwork.</h1>
          <p className="ix-m-lede">Six things, each with its own strategy. Open any of them to see what usually goes wrong, what we do about it step by step, and what changes in your working week as a result.</p>
        </header>
        <section className="ix-l-section">
          <div className="ix-l-grid-3">
            {SERVICES.map(service => (
              <Link className="ix-l-card" key={service.slug} href={`/services/${service.slug}`}>
                <span className="ix-l-icon"><ServiceIcon name={service.icon} /></span>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: "14px 0 8px" }}>{service.title}</h2>
                <p>{service.tile}</p>
                <span className="ix-l-card-more">See the strategy <ArrowRight size={14} aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
