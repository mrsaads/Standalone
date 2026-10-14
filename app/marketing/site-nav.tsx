"use client";
import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AmbientLight } from "./ambient-light";

// The public site's top bar — one definition for the landing page, the service screens and the
// location pages, so a visitor (and a crawler) finds the same way around on every one of them.
const NAV_LINKS = [
  { href: "/services", label: "Services" },
  { href: "/upwork-bidding-agency", label: "Where we work" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/profile-score", label: "Free Profile Score" },
  { href: "/signup?destination=audit", label: "Profile Audit" },
  { href: "/signup?destination=client_portal", label: "Client Portal" },
];

export function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      {/* The page's moving light layer sits with the nav because every public page renders the nav. */}
      <AmbientLight />
      <nav className="ix-l-nav" aria-label="Main">
        <Link href="/" className="ix-l-brand" aria-label="Improvexus home"><span className="ix-l-mark" aria-hidden="true">I</span><span className="ix-l-wordmark">IMPROVEXUS</span></Link>
        <div className="ix-l-nav-links">
          {NAV_LINKS.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        </div>
        <div className="ix-l-nav-actions">
          <Link href="/login" className="ix-l-btn-ghost">Log in</Link>
          <Link href="/signup" className="ix-l-btn-solid">Sign up</Link>
          <button className="ix-l-menu-toggle" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </nav>
      <div className={`ix-l-mobile-menu ${menuOpen ? "is-open" : ""}`}>
        {NAV_LINKS.map(l => <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</Link>)}
        <Link href="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
        <Link href="/signup" onClick={() => setMenuOpen(false)}>Sign up</Link>
      </div>
    </>
  );
}
