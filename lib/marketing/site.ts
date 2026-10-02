// One place for everything the public (search-facing) pages say about the business.
//
// Nothing here is invented: a street address, phone number, rating or review count that is not real
// must never be added to structured data — Google treats fabricated business details as spam, and
// it is the fastest way to lose the rich results this file exists to earn. Fields that are not known
// yet are read from environment variables and simply left out when unset.

export const SITE_NAME = "Improvexus";
export const SITE_TAGLINE = "Upwork bidding agency";

/** The public origin, without a trailing slash. Set NEXT_PUBLIC_SITE_URL once a custom domain is connected. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || "https://standalone-jcy4.onrender.com";
  const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

// The date the public content was last materially edited. The sitemap reports this as <lastmod>;
// search engines stop trusting lastmod when it changes on every build, so bump it by hand when the
// copy on the public pages actually changes.
export const CONTENT_UPDATED = "2026-10-02";

/**
 * Search results cut a title off at roughly 60 characters. Given versions of a title from most to
 * least complete, return the fullest one that fits — so a long place name loses the secondary
 * phrase instead of being truncated mid-word by the search engine.
 */
export function fitTitle(candidates: string[], max = 60): string {
  return candidates.find(candidate => candidate.length <= max) ?? candidates[candidates.length - 1];
}

/** Same idea for descriptions (~155 characters shown). */
export function fitDescription(candidates: string[], max = 155): string {
  return candidates.find(candidate => candidate.length <= max) ?? candidates[candidates.length - 1];
}

export const absoluteUrl = (path: string) => `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;

export const HOME_TITLE = "Upwork Bidding Agency & Dedicated Upwork Bidders | Improvexus";
export const HOME_DESCRIPTION =
  "Improvexus is an Upwork bidding agency. We give freelancers and agencies a dedicated Upwork bidder, a profile audit, proposal help and a weekly report.";

// The social card (app/opengraph-image.tsx). A page that sets its own `openGraph` replaces the
// inherited one wholesale, so every page spreads these in rather than losing its image.
export const OG_IMAGES = [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Improvexus, an Upwork bidding agency" }];

// What people actually type. Used for on-page copy decisions and the (low-weight) keywords tag.
export const CORE_KEYWORDS = [
  "Upwork bidding agency",
  "Upwork bidder",
  "top Upwork bidder",
  "top Upwork bidding agency",
  "hire Upwork bidder",
  "Upwork bidding services",
  "Upwork proposal writing service",
  "Upwork profile optimization",
  "Upwork lead generation agency",
  "Upwork profile management",
];

// Where the team actually works from. Country is known; city/phone/email come from env when set.
export const BUSINESS = {
  legalName: "Improvexus",
  countryCode: "PK",
  countryName: "Pakistan",
  city: process.env.NEXT_PUBLIC_BUSINESS_CITY || "",
  region: process.env.NEXT_PUBLIC_BUSINESS_REGION || "",
  phone: process.env.NEXT_PUBLIC_BUSINESS_PHONE || "",
  email: process.env.NEXT_PUBLIC_BUSINESS_EMAIL || "",
  // Comma-separated profile URLs (LinkedIn, Upwork agency page, Facebook…) for schema.org sameAs.
  sameAs: (process.env.NEXT_PUBLIC_BUSINESS_PROFILES || "").split(",").map(v => v.trim()).filter(v => v.startsWith("https://")),
  timeZone: "Asia/Karachi",
} as const;
