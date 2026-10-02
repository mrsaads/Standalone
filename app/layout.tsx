import type { Metadata, Viewport } from "next";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "./globals.css";
import { BUSINESS, CORE_KEYWORDS, HOME_DESCRIPTION, HOME_TITLE, OG_IMAGES, SITE_NAME, siteUrl } from "@/lib/marketing/site";

// Site-wide defaults. Every public page overrides title/description/canonical for itself; what is
// set here is what a page inherits if it says nothing, plus the things that are true of the whole
// site (its name, its social card, where the business is).
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: HOME_TITLE, template: `%s | ${SITE_NAME}` },
  description: HOME_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: CORE_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Business services",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", title: HOME_TITLE, description: HOME_DESCRIPTION, url: "/", images: OG_IMAGES },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESCRIPTION, images: ["/opengraph-image"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  // Paste the codes from Google Search Console / Bing Webmaster Tools into these env vars to verify
  // ownership without touching code.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  // Where the business itself is. Location pages override these with their own place.
  other: { "geo.region": BUSINESS.countryCode, "geo.placename": BUSINESS.city ? `${BUSINESS.city}, ${BUSINESS.countryName}` : BUSINESS.countryName },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#060607", width: "device-width", initialScale: 1 };

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body className="antialiased">{children}</body></html>; }
