import { BUSINESS, HOME_DESCRIPTION, SITE_NAME, absoluteUrl, siteUrl } from "./site";
import { COUNTRIES } from "./locations";
import type { Service } from "./services";

// schema.org builders. Only facts that are true and stable go in here — no ratings, no review
// counts, no opening hours, no street address unless one has been configured. Fabricated business
// details in structured data are a spam signal, not an optimisation.

const ORG_ID = () => `${siteUrl()}/#organization`;

export function organizationSchema() {
  const address: Record<string, string> = { "@type": "PostalAddress", addressCountry: BUSINESS.countryCode };
  if (BUSINESS.city) address.addressLocality = BUSINESS.city;
  if (BUSINESS.region) address.addressRegion = BUSINESS.region;
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": ORG_ID(),
    name: SITE_NAME,
    alternateName: "Improvexus Upwork Bidding Agency",
    url: siteUrl(),
    logo: absoluteUrl("/brand/improvexus-logo.png"),
    image: absoluteUrl("/opengraph-image"),
    description: HOME_DESCRIPTION,
    slogan: "Innovate. Optimize. Excel.",
    address,
    ...(BUSINESS.phone ? { telephone: BUSINESS.phone } : {}),
    ...(BUSINESS.email ? { email: BUSINESS.email } : {}),
    ...(BUSINESS.sameAs.length ? { sameAs: BUSINESS.sameAs } : {}),
    areaServed: COUNTRIES.map(country => ({ "@type": "Country", name: country.name, identifier: country.iso })),
    knowsAbout: ["Upwork", "Upwork bidding", "Upwork proposal writing", "Upwork profile optimization", "Freelance lead generation"],
    serviceType: "Upwork bidding and profile management",
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    url: siteUrl(),
    name: SITE_NAME,
    inLanguage: "en",
    publisher: { "@id": ORG_ID() },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.path) })),
  };
}

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function serviceSchema(service: Service) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    serviceType: service.seoTitle,
    description: service.seoDescription,
    url: absoluteUrl(`/services/${service.slug}`),
    provider: { "@id": ORG_ID() },
    areaServed: COUNTRIES.map(country => ({ "@type": "Country", name: country.name })),
    audience: { "@type": "Audience", audienceType: "Freelancers and agencies on Upwork" },
  };
}

type Area = { type: "Country" | "City"; name: string; containedIn?: string; lat?: number; lng?: number };

function areaNode(area: Area) {
  const node: Record<string, unknown> = { "@type": area.type, name: area.name };
  if (area.containedIn) node.containedInPlace = { "@type": "Country", name: area.containedIn };
  if (area.lat !== undefined && area.lng !== undefined) node.geo = { "@type": "GeoCoordinates", latitude: area.lat, longitude: area.lng };
  return node;
}

/** A Service offered to one place, or to a list of places (the hub page). `about` names what the page is specifically about. */
export function localServiceSchema(args: { name: string; description: string; path: string; areas: Area[]; about?: string[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: args.name,
    serviceType: "Upwork bidding agency",
    description: args.description,
    url: absoluteUrl(args.path),
    provider: { "@id": ORG_ID() },
    areaServed: args.areas.length === 1 ? areaNode(args.areas[0]) : args.areas.map(areaNode),
    ...(args.about?.length ? { about: args.about.map(name => ({ "@type": "Thing", name })) } : {}),
  };
}
