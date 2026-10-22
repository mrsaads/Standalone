"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Link2, CircleAlert, CircleCheck, CircleDashed, FileSearch, LoaderCircle, Lock, MessageCircle, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CountrySelect, guessCountry } from "@/app/marketing/lead-form";
import type { ProfileScoreResult, ScoreFieldErrors, ScoreFieldKey } from "@/lib/profile-score";

// Mirrors OVERVIEW_MIN and OVERVIEW_MAX in lib/profile-score.ts. Repeated rather than imported:
// that module reaches the database through lib/leads.ts and must never be bundled for the browser.
// The server re-checks every rule, so a drift here could only make the button too eager, never
// let a bad request through.
const OVERVIEW_MIN = 80;
const OVERVIEW_MAX = 5000;

// Reading the profile can take up to about half a minute when Upwork is slow (the server waits and
// tries again rather than giving up), so the visitor is shown what is happening the whole time.
const STEPS = ["Opening your Upwork profile", "Reading your profile details", "Comparing you with top profiles", "Working out your score"];

function looksLikeProfileLink(value: string) {
  return /^(https?:\/\/)?(www\.)?upwork\.com\/(freelancers|fl)\/[^/\s?#]+/i.test(value.trim());
}

// What Upwork's sign-in page can send the visitor back with (see app/api/upwork/callback/route.ts).
const UPWORK_NOTICES: Record<string, string> = {
  off: "Connecting Upwork isn't switched on yet. Paste your profile link below instead.",
  denied: "Upwork sign-in was cancelled, so nothing was read. You can try again or paste your profile link below.",
  invalid: "That Upwork sign-in couldn't be confirmed. Please try connecting again.",
  busy: "Too many Upwork sign-ins from this network just now. Please try again in a few minutes.",
  scope: "Upwork didn't allow us to read your profile with that sign-in. Paste your profile link below instead.",
  failed: "We couldn't read your profile from Upwork just now. No score was generated. Please try again in a few minutes.",
  mismatch: "That link belongs to a different profile than the connected Upwork account.",
  account: "Connect the freelancer account that owns the profile link.",
};
const PENDING_KEY = "ix_ps_pending";
type Pending = { waCountry: string; waNumber: string; email: string; consent: boolean; savedAt: number };

export function ScoreForm({ signedIn, automaticImport = false, upworkConnect = false }: { signedIn: boolean; automaticImport?: boolean; upworkConnect?: boolean }) {
  const [profileUrl, setProfileUrl] = useState("");
  const [waCountry, setWaCountry] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [email, setEmail] = useState("");
  const [overview, setOverview] = useState("");
  const [showOverview, setShowOverview] = useState(false);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<ScoreFieldErrors>({});
  const [result, setResult] = useState<ProfileScoreResult | null>(null);
  const [connectedReady, setConnectedReady] = useState(false); // Upwork approved access; the profile is waiting on the server
  const [notice, setNotice] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
    const guess = guessCountry();
    if (guess) setWaCountry(c => c || guess);
    // Back from Upwork's sign-in page. The details typed before leaving were parked in this tab's
    // session storage (never sent anywhere); if they are all still there the score starts by itself.
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("upwork");
    const connected = params.get("connected") === "1";
    if (!outcome && !connected) return;
    window.history.replaceState(null, "", window.location.pathname);
    let saved: Pending | null = null;
    try {
      const pending = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) || "null");
      window.sessionStorage.removeItem(PENDING_KEY);
      if (pending && typeof pending.waCountry === "string" && pending.waCountry.length === 2 &&
          typeof pending.waNumber === "string" && pending.waNumber.length <= 40 &&
          typeof pending.email === "string" && pending.email.length <= 254 && pending.consent === true &&
          typeof pending.savedAt === "number" && Date.now() - pending.savedAt >= 0 && Date.now() - pending.savedAt < 15 * 60 * 1000) saved = pending;
    } catch { /* storage blocked: the visitor re-enters the details */ }
    if (saved) {
      setWaCountry(saved.waCountry); setWaNumber(saved.waNumber); setEmail(saved.email); setConsent(true);
    }
    if (outcome) { setNotice(UPWORK_NOTICES[outcome] ?? UPWORK_NOTICES.failed); return; }
    setConnectedReady(true);
    if (saved) {
      void runScore({ connected: true, profileUrl: "", overview: "", email: saved.email, waCountry: saved.waCountry, waNumber: saved.waNumber, consent: true });
    } else {
      setNotice("Upwork is connected. Add your WhatsApp number and tick the box below, then press the button to see your score.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const timer = window.setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 6000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!result) return;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [result]);

  const clear = (key: ScoreFieldKey) => setFields(f => (f[key] ? { ...f, [key]: undefined } : f));
  const overviewLength = overview.trim().length;

  function openOverview(focus = true) {
    setShowOverview(true);
    if (focus) requestAnimationFrame(() => { overviewRef.current?.focus({ preventScroll: true }); overviewRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); });
  }

  // The button only switches on once everything the server will ask for is present. What is still
  // missing is spelled out under it, so a disabled button never leaves anyone guessing.
  const missing: string[] = [];
  if (!connectedReady && !looksLikeProfileLink(profileUrl)) missing.push("your Upwork profile link");
  if (!waCountry || waNumber.replace(/\D/g, "").length < 6) missing.push("your WhatsApp number");
  if (!consent) missing.push("your agreement below");
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const overviewOk = overviewLength === 0 || (overviewLength >= OVERVIEW_MIN && overviewLength <= OVERVIEW_MAX);
  const ready = missing.length === 0 && emailOk && overviewOk;

  type Payload = { connected: boolean; profileUrl: string; overview: string; email: string; waCountry: string; waNumber: string; consent: boolean };
  async function runScore(payload: Payload) {
    setBusy(true); setError(""); setNotice(""); setFields({});
    try {
      const response = await fetch("/api/profile-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: crypto.randomUUID(), profileUrl: payload.profileUrl, overview: payload.overview, email: payload.email,
          whatsappCountry: payload.waCountry, whatsappNumber: payload.waNumber, consent: payload.consent, website, connected: payload.connected,
        }),
      });
      const body = await response.json() as { result?: ProfileScoreResult; error?: string; code?: string; fields?: ScoreFieldErrors };
      if (!response.ok || !body.result) {
        if (body.fields && Object.keys(body.fields).length) setFields(body.fields);
        if (body.code === "CONNECTION_EXPIRED") setConnectedReady(false);
        if (!automaticImport && !payload.connected && body.code === "NEEDS_OVERVIEW") openOverview();
        throw new Error(body.error || "We couldn't score your profile right now. Please try again.");
      }
      setConnectedReady(false);
      setResult(body.result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't score your profile right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    await runScore({ connected: connectedReady, profileUrl, overview, email, waCountry, waNumber, consent });
  }

  // Leaves for Upwork's own sign-in page. The contact details are parked in this tab's session
  // storage so the score can start by itself when Upwork sends the visitor back.
  const contactReady = Boolean(waCountry) && waNumber.replace(/\D/g, "").length >= 6 && consent && emailOk;
  function connectUpwork() {
    if (!contactReady || busy || !looksLikeProfileLink(profileUrl)) { setFields(current => ({ ...current, profileUrl: "Add the Upwork profile link you want to score first." })); return; }
    try { window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ waCountry, waNumber, email, consent, savedAt: Date.now() } satisfies Pending)); } catch { /* the visitor re-enters them on return */ }
    window.location.assign(`/api/upwork/mcp/connect?destination=score&profileUrl=${encodeURIComponent(profileUrl)}`);
  }

  const fieldError = (key: ScoreFieldKey) => fields[key] ? <p className="ix-l-field-error" role="alert" id={`ps-${key}-error`}>{fields[key]}</p> : null;
  const describe = (key: ScoreFieldKey) => (fields[key] ? `ps-${key}-error` : undefined);
  const auditHref = signedIn ? "/audits" : "/signup?next=%2Faudits";

  return (
    <div className="ix-ps-layout">
      <form className="ix-l-enquiry-form ix-ps-form" onSubmit={submit} noValidate aria-busy={busy}>
        <div className="ix-l-field">
          <label htmlFor="ps-link">Upwork profile link</label>
          <Input id="ps-link" inputMode="url" autoComplete="url" maxLength={500} value={profileUrl} disabled={busy}
            onChange={e => { setProfileUrl(e.target.value); clear("profileUrl"); }}
            aria-invalid={!!fields.profileUrl || undefined} aria-describedby={describe("profileUrl")}
            placeholder="https://www.upwork.com/freelancers/~01…" />
          {fieldError("profileUrl")}
        </div>

        <div className="ix-l-field">
          <label htmlFor="ps-whatsapp">WhatsApp number</label>
          <div className="ix-l-phone">
            <CountrySelect full={mounted} id="ps-whatsapp-country" label="Country code for your WhatsApp number" value={waCountry} disabled={busy}
              invalid={!!fields.whatsapp} onChange={iso => { setWaCountry(iso); clear("whatsapp"); }} />
            <Input id="ps-whatsapp" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={20} value={waNumber} disabled={busy}
              onChange={e => { setWaNumber(e.target.value); clear("whatsapp"); }}
              aria-invalid={!!fields.whatsapp || undefined} aria-describedby={describe("whatsapp")}
              placeholder={waCountry === "PK" ? "300 1234567" : "WhatsApp number"} />
          </div>
          {fieldError("whatsapp")}
        </div>

        <div className="ix-l-field">
          <label htmlFor="ps-email">Email <span>optional</span></label>
          <Input id="ps-email" type="email" autoComplete="email" maxLength={254} value={email} disabled={busy}
            onChange={e => { setEmail(e.target.value); clear("email"); }}
            aria-invalid={!!fields.email || !emailOk || undefined} aria-describedby={describe("email")} placeholder="you@example.com" />
          {fieldError("email") ?? (!emailOk ? <p className="ix-l-field-error">Enter a valid email address, or leave it empty.</p> : null)}
        </div>

        {!automaticImport && !connectedReady && <div className={`ix-ps-optional ${showOverview ? "is-open" : ""}`}>
          <button type="button" className="ix-ps-optional-toggle" aria-expanded={showOverview} aria-controls="ps-overview-panel" onClick={() => (showOverview ? setShowOverview(false) : openOverview())}>
            <Sparkles size={15} /> Add your overview for a fuller score <span>optional</span> <ChevronDown size={15} className="ix-ps-chevron" />
          </button>
          {showOverview && (
            <div className="ix-l-field" id="ps-overview-panel">
              <p className="ix-l-field-help">Connect Upwork to import all five profile sections, or paste your overview here for a more complete score without connecting.</p>
              <Textarea id="ps-overview" ref={overviewRef} className="ix-ps-overview" maxLength={OVERVIEW_MAX} value={overview} disabled={busy}
                onChange={e => { setOverview(e.target.value); clear("overview"); }}
                aria-label="Your profile overview" aria-invalid={!!fields.overview || !overviewOk || undefined} aria-describedby={describe("overview") ?? "ps-overview-count"}
                placeholder="Paste the overview (the About section) from your Upwork profile." />
              <p className="ix-l-field-count" id="ps-overview-count" aria-live="polite" data-ok={overviewLength >= OVERVIEW_MIN ? "true" : undefined}>
                {overviewLength === 0 ? "Leave empty to skip" : overviewLength < OVERVIEW_MIN ? `${OVERVIEW_MIN - overviewLength} more characters, or leave it empty` : `${overviewLength.toLocaleString("en-US")} characters`}
              </p>
              {fieldError("overview")}
            </div>
          )}
        </div>}

        <div className="ix-l-honeypot" aria-hidden="true"><label htmlFor="ps-website">Website</label><input id="ps-website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></div>

        <label className="ix-l-consent" htmlFor="ps-consent">
          <Checkbox id="ps-consent" checked={consent} disabled={busy} onCheckedChange={v => { setConsent(v === true); clear("consent"); }}
            aria-invalid={!!fields.consent || undefined} aria-describedby={describe("consent")} />
          <span>I agree to share my WhatsApp number (and email, if I added one) with Improvexus and to be contacted about my profile score.</span>
        </label>
        {fieldError("consent")}

        {notice && <p className="ix-ps-notice" role="status">{notice}</p>}
        {error && <p className="ix-l-error" role="alert"><CircleAlert size={15} className="ix-ps-inline-icon" />{error}</p>}

        {upworkConnect && !connectedReady && (
          <div className="ix-ps-connect">
            <button type="button" className="ix-l-btn-solid ix-l-submit ix-ps-submit" disabled={!contactReady || !looksLikeProfileLink(profileUrl) || busy} onClick={connectUpwork}>
              <Link2 size={16} /> Connect Upwork and import this profile
            </button>
            <p className="ix-ps-connect-note">You sign in on Upwork and approve read-only access. We import the title, overview, skills, portfolio, and certifications for the link above. We never see your password. {contactReady ? "" : "Add your WhatsApp number and tick the box first."}</p>
            <p className="ix-ps-or" aria-hidden="true"><span>or paste your link above and score without connecting</span></p>
          </div>
        )}
        <button type="submit" className="ix-l-btn-solid ix-l-submit ix-ps-submit" disabled={!ready || busy}>
          {busy ? <><LoaderCircle size={16} className="ix-ps-spin" /> Scoring your profile…</> : <>{connectedReady ? "Score my connected profile" : "Score my profile"} <ArrowRight size={15} /></>}
        </button>
        {!busy && missing.length > 0 && <p className="ix-ps-missing">To switch this on, add {joinList(missing)}.</p>}
        {busy && (
          <div className="ix-ps-wait" aria-live="polite">
            <ol className="ix-ps-steps">
              {STEPS.map((label, i) => (
                <li key={label} data-state={i < step ? "done" : i === step ? "active" : "todo"}>
                  {i < step ? <CircleCheck size={15} /> : i === step ? <LoaderCircle size={15} className="ix-ps-spin" /> : <CircleDashed size={15} />}
                  {label}
                </li>
              ))}
            </ol>
            <p>This can take up to a minute when Upwork is slow. Keep this page open.</p>
          </div>
        )}
      </form>

      {result ? (
        <ScoreResult result={result} auditHref={auditHref} signedIn={signedIn} innerRef={resultRef} automaticImport={automaticImport} onAddOverview={() => { setResult(null); openOverview(); }} />
      ) : (
        <aside className="ix-ps-aside">
          <h2>What you get</h2>
          <ul>
            <li>A score out of 100, measured against the pattern top Upwork profiles follow.</li>
            <li>Points for your title, overview, skills, portfolio and certifications{automaticImport ? " imported from your connected profile." : "; connect Upwork to import every section."}</li>
            <li>The three changes that would raise your score the most.</li>
          </ul>
          <p className="ix-ps-aside-note"><MessageCircle size={14} /> We&apos;ll only use your WhatsApp number to talk to you about your score.</p>
        </aside>
      )}
    </div>
  );
}

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function StatLines({ lines }: { lines: { label: string; value: string }[] }) {
  return <dl className="ix-ps-track">{lines.map(line => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>;
}

function ScoreResult({ result, auditHref, signedIn, innerRef, onAddOverview, automaticImport }: { automaticImport: boolean; result: ProfileScoreResult; auditHref: string; signedIn: boolean; innerRef: React.RefObject<HTMLDivElement | null>; onAddOverview: () => void }) {
  const tone = result.score >= 85 ? "strong" : result.score >= 70 ? "good" : result.score >= 50 ? "mid" : "weak";
  return (
    <div className="ix-ps-result" ref={innerRef} tabIndex={-1} aria-labelledby="ps-score-heading">
      <div className="ix-ps-score-head">
        <div className="ix-ps-ring" data-tone={tone} style={{ ["--ix-ps-pct" as string]: `${result.score}` }} role="img" aria-label={`Score ${result.score} out of 100`}>
          <span><b>{result.score}</b><small>out of 100</small></span>
        </div>
        <div>
          <span className="ix-l-eyebrow">YOUR PROFILE SCORE</span>
          <h2 id="ps-score-heading">{result.band}</h2>
          {result.profile.title && <p className="ix-ps-title">&ldquo;{result.profile.title}&rdquo;</p>}
          {result.assessedPoints < 100 && <p className="ix-ps-partial">Based on the {result.assessedPoints} of 100 points we could check.</p>}
        </div>
      </div>

      {!automaticImport && !result.overviewScored && (
        <button type="button" className="ix-ps-boost" onClick={onAddOverview}>
          <Sparkles size={16} /> Add your overview to score the other {100 - result.assessedPoints} points <ArrowRight size={14} />
        </button>
      )}

      <ul className="ix-ps-sections">
        {result.sections.map((section, i) => (
          <li key={section.id} data-checked={section.checked ? "true" : "false"} style={{ ["--ix-ps-i" as string]: i }}>
            <div className="ix-ps-row">
              <span>{section.label}</span>
              <b>{section.checked ? `${section.points} of ${section.max}` : "Not checked"}</b>
            </div>
            {section.checked && <div className="ix-ps-bar" aria-hidden="true"><i style={{ width: `${Math.round(((section.points ?? 0) / section.max) * 100)}%` }} /></div>}
            {section.note && <p>{section.note}</p>}
            {section.id === "track" && result.track && <StatLines lines={result.track.lines} />}
            {section.id === "offer" && result.offer && <StatLines lines={result.offer.lines} />}
          </li>
        ))}
      </ul>

      {result.topFlaws.length > 0 && (
        <div className="ix-ps-flaws">
          <h3>What would raise your score most</h3>
          <ol>{result.topFlaws.map(f => <li key={f}>{f}</li>)}</ol>
        </div>
      )}
      {result.strengths.length > 0 && (
        <div className="ix-ps-strengths">
          <h3>Already working</h3>
          <ul>{result.strengths.map(s => <li key={s}>{s}</li>)}</ul>
        </div>
      )}

      <div className="ix-ps-cta">
        <span className="ix-ps-cta-icon"><FileSearch size={20} /></span>
        <div>
          <h3>Get to know every flaw on your profile</h3>
          <p>This quick score doesn&apos;t look at your {joinList(result.notChecked.map(n => n.toLowerCase()))}. The full audit checks 23 points across your whole profile, explains each flaw with the evidence, and gives you a fix list in order of priority, with PDF and Word downloads.</p>
          <Link href={auditHref} className="ix-l-btn-solid ix-ps-cta-btn">Generate my full audit report <ArrowRight size={15} /></Link>
          {!signedIn && <p className="ix-ps-cta-note"><Lock size={13} /> You&apos;ll create a free account or <Link href="/login?next=%2Faudits">log in</Link> first, then go straight to the audit page.</p>}
        </div>
      </div>
    </div>
  );
}
