"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Briefcase, Check, CircleAlert, FileSearch, LayoutDashboard, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function Brand() { return <div className="ix-brand"><span className="ix-brand-image"><img src="/brand/improvexus-logo.png" alt="" /></span><span>IMPROVEXUS<small>CLIENT PORTAL</small></span></div>; }
async function signOut() { try { await createSupabaseBrowserClient().auth.signOut(); } finally { window.location.href = "/login"; } }

function PortalHeader() {
  return (
    <header className="ix-header">
      <Link href="/client-portal" className="ix-home" aria-label="Improvexus client portal"><Brand /></Link>
      <nav><Button variant="ghost" asChild><Link href="/audit">Profile Audit</Link></Button></nav>
      <Button variant="ghost" className="ix-text-link" onClick={() => void signOut()}>Sign out</Button>
    </header>
  );
}

type WorkspaceProfile = { id: string; name: string; upworkUrl: string };
type Workspace = { workspaceId: string; name: string; objectives: string; accountManagerEmail: string; profiles: WorkspaceProfile[] };

export function ClientPortalAssigned({ email, workspaces }: { email: string; workspaces: Workspace[] }) {
  return (
    <div className="ix-app">
      <PortalHeader />
      <main className="ix-workspace">
        <div className="ix-heading">
          <div>
            <span className="ix-overline">IMPROVEXUS / CLIENT PORTAL</span>
            <h1>Welcome back.</h1>
            <p>Signed in as {email}. Your weekly reports, documents, and payment history for each managed workspace live here.</p>
          </div>
        </div>
        {workspaces.map(ws => (
          <section className="ix-surface" key={ws.workspaceId} style={{ marginBottom: 20 }}>
            <div className="ix-panel-title">
              <span className="ix-icon-tile"><Briefcase size={21} /></span>
              <div>
                <h2>{ws.name}</h2>
                <p>{ws.objectives || "No objectives on file yet."}</p>
              </div>
            </div>
            {ws.profiles.length > 0 && (
              <div className="ix-mini-stats">
                {ws.profiles.map(p => (
                  <div key={p.id}><span>Profile</span><strong>{p.name}</strong></div>
                ))}
              </div>
            )}
            <div className="ix-notice" style={{ marginTop: 16 }}>
              <BadgeCheck size={17} />
              <p>Weekly reports, documents, and payment history for this workspace are being finished — your account manager ({ws.accountManagerEmail || "Improvexus"}) will notify you here once they&apos;re available.</p>
            </div>
          </section>
        ))}
        <aside className="ix-surface ix-review-note">
          <span className="ix-icon-tile ix-icon-purple"><Target size={21} /></span>
          <h3>Want a fresh profile audit?</h3>
          <p>Client-portal access never uses an audit credit or requires a separate subscription — run the audit tool any time with this same account.</p>
          <Button className="ix-btn-primary" asChild><Link href="/audit">Open Profile Audit <ArrowRight size={15} /></Link></Button>
        </aside>
      </main>
    </div>
  );
}

export function ClientPortalAccessRequest({ email, fullName }: { email: string; fullName: string }) {
  const [name, setName] = useState(fullName);
  const [profileLink, setProfileLink] = useState("");
  const [goals, setGoals] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [website, setWebsite] = useState("");
  const submissionId = useRef("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!consent) { setError("Please agree to share this request so Improvexus can review it."); return; }
    setSaving(true); setError("");
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submissionId.current, name, email, profileLink, goals, source: "client_portal_access_request", consent, website }),
      });
      const result = await response.json() as { error?: string; reference?: string };
      if (!response.ok || typeof result.reference !== "string") throw new Error(result.error || "Your request could not be saved. Please try again.");
      setReceipt(result.reference);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your request could not be saved. Please try again."); }
    finally { setSaving(false); }
  }

  return (
    <div className="ix-app">
      <PortalHeader />
      <main className="ix-workspace">
        <div className="ix-heading">
          <div>
            <span className="ix-overline">IMPROVEXUS / CLIENT PORTAL</span>
            <h1>You don&apos;t have client-portal access yet.</h1>
            <p>The client portal is for freelancers Improvexus manages on an ongoing basis. Run a profile audit any time with this same account — or request managed-client access below.</p>
          </div>
        </div>
        <div className="ix-review-grid">
          <section className="ix-surface">
            {receipt ? (
              // Deliberately not the shared .success-message/.success-icon/.receipt classes from
              // results.css — those are calibrated for the white .enquiry-panel card the in-workspace
              // enquiry dialog renders on (dark text on a light background). This screen sits directly
              // on the app's dark .ix-surface, so it needs its own colors, not that light-context set.
              <div role="status" style={{ textAlign: "center", padding: "12px 0" }}>
                <span className="ix-icon-tile" style={{ margin: "0 auto 16px" }}><Check size={22} /></span>
                <h2 style={{ margin: "0 0 10px" }}>Your request is saved.</h2>
                <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>Improvexus will review it and follow up by email. This does not grant access automatically.</p>
                <p style={{ color: "var(--muted)", fontSize: 12, fontFamily: "monospace", margin: "12px 0 20px" }}>Reference: {receipt}</p>
                <Button variant="outline" className="ix-btn-secondary" asChild><Link href="/audit">Go to Profile Audit</Link></Button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="ix-panel-title">
                  <span className="ix-icon-tile"><FileSearch size={21} /></span>
                  <div><h2>Request managed-client access</h2><p>Tell Improvexus what ongoing support you&apos;re looking for.</p></div>
                </div>
                <div className="ix-field"><label htmlFor="cp-name">Your name</label><Input id="cp-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div>
                <div className="ix-field"><label htmlFor="cp-link">Upwork profile link<span>Optional</span></label><Input id="cp-link" maxLength={500} value={profileLink} onChange={e => setProfileLink(e.target.value)} placeholder="https://www.upwork.com/freelancers/…" /></div>
                <div className="ix-field"><label htmlFor="cp-goals">What are you hoping for?<span>Optional</span></label><Textarea id="cp-goals" maxLength={1200} value={goals} onChange={e => setGoals(e.target.value)} placeholder="e.g. Ongoing proposal support and weekly progress reviews." /></div>
                <div className="honeypot" aria-hidden="true"><label htmlFor="cp-website">Website</label><input id="cp-website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></div>
                <label htmlFor="cp-consent" className="consent"><Checkbox id="cp-consent" checked={consent} onCheckedChange={v => setConsent(v === true)} /><span>I agree to share this request with Improvexus for review.</span></label>
                {error && <p role="alert" className="ix-error"><CircleAlert size={17} />{error}</p>}
                <Button type="submit" className="ix-btn-primary" style={{ marginTop: 12 }} disabled={saving}>{saving ? "Sending…" : "Send request"} <ArrowRight size={15} /></Button>
              </form>
            )}
          </section>
          <aside className="ix-context-column">
            <div className="ix-surface ix-review-note">
              <span className="ix-icon-tile"><LayoutDashboard size={20} /></span>
              <h3>What managed-client access includes</h3>
              <p>Weekly reports, ongoing profile management, and a record of completed work and payments — set up by an Improvexus admin, never granted automatically by this request.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
