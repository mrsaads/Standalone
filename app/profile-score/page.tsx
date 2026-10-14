import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { breadcrumbSchema } from "@/lib/marketing/schema";
import { OG_IMAGES, SITE_NAME } from "@/lib/marketing/site";
import { SiteNav } from "@/app/marketing/site-nav";
import { SiteFooter } from "@/app/marketing/site-footer";
import { JsonLd } from "@/app/marketing/json-ld";
import { ScoreForm } from "./score-form";
import "@/app/landing.css";
import "@/app/marketing/marketing.css";
import "./profile-score.css";

// The free Upwork profile score. Public (see middleware.ts publicPaths). The form and the result
// live on this one page: the visitor never leaves it until they choose the full audit.

export const dynamic = "force-dynamic";

const DESCRIPTION = "Get a free Upwork profile score out of 100. We compare your title, track record and overview with the pattern top Upwork profiles follow, and show you what to fix first.";

export const metadata: Metadata = {
  title: "Free Upwork Profile Score out of 100",
  description: DESCRIPTION,
  alternates: { canonical: "/profile-score" },
  openGraph: { type: "website", siteName: SITE_NAME, url: "/profile-score", title: "Free Upwork Profile Score | Improvexus", description: DESCRIPTION, images: OG_IMAGES },
};

export default async function ProfileScorePage() {
  // Only decides where the "full audit" button goes. A failed lookup just means "not signed in".
  const user = await getCurrentUser().catch(() => null);
  return (
    <div className="ix-landing">
      <JsonLd data={[breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Profile score", path: "/profile-score" }])]} />
      <SiteNav />
      <main className="ix-m-main">
        <header className="ix-m-hero ix-ps-hero">
          <ol className="ix-m-crumbs" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li aria-current="page">Profile score</li>
          </ol>
          <span className="ix-l-eyebrow">FREE UPWORK PROFILE SCORE</span>
          <h1>How does your Upwork profile score out of 100?</h1>
          <p className="ix-m-lede">Paste your profile link and your overview. We check your title, your track record and how your overview reads against the pattern top Upwork profiles follow, then show your score and the three changes that would raise it most.</p>
        </header>
        <section className="ix-ps-section" aria-label="Score your profile">
          <ScoreForm signedIn={Boolean(user)} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
