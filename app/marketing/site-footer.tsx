import Link from "next/link";
import { SERVICES } from "@/lib/marketing/services";
import { COUNTRIES, LOCATIONS_BASE, countryPath } from "@/lib/marketing/locations";

// The public footer. Deliberately link-heavy: it is the one place every public page links to every
// service screen and every country page, which is what lets a crawler reach all of them from any
// entry point without relying on the sitemap alone.
export function SiteFooter() {
  return (
    <footer className="ix-l-footer-full">
      <div className="ix-l-footer-grid">
        <div>
          <p className="ix-l-footer-brand">IMPROVEXUS</p>
          <p className="ix-l-footer-blurb">We are an Upwork bidding agency. Freelancers and agencies come to us for a dedicated Upwork bidder, a profile audit, help with proposals and a weekly report.</p>
          <p className="ix-l-footer-blurb">We don&apos;t promise rankings, jobs or earnings.</p>
        </div>
        <nav aria-label="Services">
          <p className="ix-l-footer-head">Services</p>
          <ul>
            {SERVICES.map(s => <li key={s.slug}><Link href={`/services/${s.slug}`}>{s.title}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Countries">
          <p className="ix-l-footer-head"><Link href={LOCATIONS_BASE}>Where we work</Link></p>
          <ul className="ix-l-footer-cols">
            {COUNTRIES.map(country => <li key={country.slug}><Link href={countryPath(country)}>{country.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Account">
          <p className="ix-l-footer-head">Get started</p>
          <ul>
            <li><Link href="/signup?destination=audit">Audit my profile</Link></li>
            <li><Link href="/#enquiry">Talk to us</Link></li>
            <li><Link href="/login">Log in</Link></li>
            <li><Link href="/signup">Create an account</Link></li>
          </ul>
        </nav>
      </div>
      <p className="ix-l-footer-base">IMPROVEXUS. INNOVATE. OPTIMIZE. EXCEL.</p>
    </footer>
  );
}
