"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, ClipboardList, FileSearch, Menu, RefreshCw, ShieldCheck, Target, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AuthCube } from "@/app/auth/auth-cube";
import "@/app/auth/auth-cube.css";
import "./landing.css";

const NAV_LINKS = [
  { href: "#services", label: "Services" },
  { href: "#how-it-works", label: "How it works" },
  { href: "/signup?destination=audit", label: "Profile Audit" },
  { href: "/signup?destination=client_portal", label: "Client Portal" },
];

const SERVICES = [
  { icon: FileSearch, title: "Upwork profile audits & optimization", body: "A structured, evidence-based review of your headline, overview, portfolio, and proof of work." },
  { icon: Target, title: "Positioning, headlines & overview", body: "Sharper opening lines built around a specific buyer and a deliverable you can back up." },
  { icon: ClipboardList, title: "Job targeting & proposal support", body: "Help finding the right jobs and writing proposals that speak to the client's actual problem." },
  { icon: RefreshCw, title: "Ongoing profile management", body: "Continuous upkeep as your services, rates, and portfolio evolve." },
  { icon: Users, title: "Weekly reporting & progress reviews", body: "Regular check-ins on what changed, what it affected, and what's next." },
  { icon: ShieldCheck, title: "Evidence before assumptions", body: "Every finding is tied to something actually on your profile — never a guess." },
];

const STEPS = [
  { title: "Understand your profile, services, and goals", body: "We start from your actual profile evidence and what you're trying to achieve." },
  { title: "Identify improvements and agree on priorities", body: "A clear, prioritized list — not a generic checklist." },
  { title: "Implement, track results, and refine the approach", body: "Ongoing work stays visible through weekly reports you can check any time." },
];

const FAQS = [
  { q: "What does a profile audit check?", a: "An 8-area, evidence-based review — headline and offer clarity, relevant portfolio work, buyer relevance, credible proof, a clear next step, and platform consistency. Every finding is backed by something on your actual profile; unverified checks are excluded from scoring rather than guessed at." },
  { q: "What's the difference between the audit tool and client-portal access?", a: "The audit tool is self-serve: run it any time with your account, no ongoing engagement required. Client-portal access is for freelancers Improvexus manages on an ongoing basis — weekly reports, profile management, and payment history — and is set up manually by an admin after reviewing a request, never granted automatically." },
  { q: "Can I download my report?", a: "Yes — every generated audit is saved to your account and exports as a branded PDF or Word document, following the same locked report structure every time." },
  { q: "How do I get managed-client access?", a: "Sign up, then submit a request from the client portal (or the enquiry form below) describing what ongoing support you're looking for. An Improvexus admin reviews it and follows up by email." },
];

function LeadForm() {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [profileLink, setProfileLink] = useState(""); const [goals, setGoals] = useState("");
  const [consent, setConsent] = useState(false); const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [receipt, setReceipt] = useState("");
  const submissionId = useRef("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!consent) { setError("Please agree to share your details so Improvexus can review this."); return; }
    setSaving(true); setError("");
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submissionId.current, name, email, profileLink, goals, source: "landing_general", consent, website }),
      });
      const result = await response.json() as { error?: string; reference?: string };
      if (!response.ok || typeof result.reference !== "string") throw new Error(result.error || "Your enquiry could not be saved. Please try again.");
      setReceipt(result.reference);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your enquiry could not be saved. Please try again."); }
    finally { setSaving(false); }
  }

  if (receipt) {
    return (
      <div className="ix-l-enquiry-form ix-l-receipt">
        <Check size={26} />
        <strong>Your enquiry is saved.</strong>
        <p style={{ color: "var(--ix-l-muted)", fontSize: 14 }}>Improvexus will review it and follow up by email. This does not book a call or confirm a service.</p>
        <p style={{ color: "var(--ix-l-muted-2)", fontSize: 12.5, marginTop: 10 }}>Reference: {receipt}</p>
      </div>
    );
  }

  return (
    <form className="ix-l-enquiry-form" onSubmit={submit}>
      <label className="ix-l-field" htmlFor="lead-name">Your name<Input id="lead-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="ix-l-field" htmlFor="lead-email">Email<Input id="lead-email" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="ix-l-field" htmlFor="lead-link">Upwork profile link <span>Optional</span><Input id="lead-link" maxLength={500} value={profileLink} onChange={e => setProfileLink(e.target.value)} placeholder="https://www.upwork.com/freelancers/…" /></label>
      <label className="ix-l-field" htmlFor="lead-goals">What are your goals? <span>Optional</span><Textarea id="lead-goals" maxLength={1200} value={goals} onChange={e => setGoals(e.target.value)} placeholder="e.g. I want more replies to proposals for CRM migration projects." /></label>
      <div className="ix-l-honeypot" aria-hidden="true"><label htmlFor="lead-website">Website</label><input id="lead-website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></div>
      <label className="ix-l-consent" htmlFor="lead-consent"><Checkbox id="lead-consent" checked={consent} onCheckedChange={v => setConsent(v === true)} /><span>I agree to share these details with Improvexus and to be contacted about this enquiry.</span></label>
      {error && <p className="ix-l-error"><CircleAlert size={15} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />{error}</p>}
      <button type="submit" className="ix-l-btn-solid" disabled={saving} style={{ border: "none", width: "100%", justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 6 }}>
        {saving ? "Sending…" : "Let's work on your Upwork growth"} <ArrowRight size={15} />
      </button>
    </form>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="ix-landing">
      <nav className="ix-l-nav">
        <a href="#top" className="ix-l-brand"><span className="ix-l-mark">I</span><span className="ix-l-wordmark">IMPROVEXUS</span></a>
        <div className="ix-l-nav-links">
          {NAV_LINKS.map(l => <a key={l.href} href={l.href}>{l.label}</a>)}
        </div>
        <div className="ix-l-nav-actions">
          <Link href="/login" className="ix-l-btn-ghost">Log in</Link>
          <Link href="/signup" className="ix-l-btn-solid">Sign up</Link>
          <button className="ix-l-menu-toggle" aria-label="Toggle menu" onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </nav>
      <div className={`ix-l-mobile-menu ${menuOpen ? "is-open" : ""}`}>
        {NAV_LINKS.map(l => <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a>)}
        <a href="/login" onClick={() => setMenuOpen(false)}>Log in</a>
        <a href="/signup" onClick={() => setMenuOpen(false)}>Sign up</a>
      </div>

      <header className="ix-l-hero" id="top">
        <div className="ix-l-hero-copy">
          <span className="ix-l-eyebrow">IMPROVEXUS · UPWORK PROFILE INTELLIGENCE</span>
          <h1>Build a stronger Upwork presence.</h1>
          <p>From profile optimization to proposal support and ongoing account management, Improvexus helps you approach freelance growth with a clear plan.</p>
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
            <div className="ix-l-card" key={s.title}>
              <span className="ix-l-icon"><s.icon size={18} /></span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
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

      <section className="ix-l-section" id="work-with-us">
        <div className="ix-l-work-grid">
          <div>
            <div className="ix-l-section-head" style={{ marginBottom: 20 }}>
              <span>WORK WITH IMPROVEXUS</span>
              <h2>Let&apos;s work on your Upwork growth.</h2>
              <p>Use the audit tool independently whenever you like, or tell us about your goals and we&apos;ll review whether ongoing, managed support is a fit.</p>
            </div>
            <Accordion type="single" collapsible>
              {FAQS.map(f => (
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

      <footer className="ix-l-footer">IMPROVEXUS — INNOVATE. OPTIMIZE. EXCEL.</footer>
    </div>
  );
}
