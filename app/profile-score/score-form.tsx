"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, CircleDashed, FileSearch, LoaderCircle, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CountrySelect, guessCountry } from "@/app/marketing/lead-form";
import type { ProfileScoreResult, ScoreFieldErrors, ScoreFieldKey } from "@/lib/profile-score";

// Mirrors OVERVIEW_MIN and OVERVIEW_MAX in lib/profile-score.ts. Repeated rather than imported:
// that module reaches the database through lib/leads.ts and must never be bundled for the browser.
// The server re-checks every rule, so a drift here could only make the button too eager, never
// let a bad request through.
const OVERVIEW_MIN = 150;
const OVERVIEW_MAX = 5000;

const STEPS = ["Reading your public Upwork profile", "Comparing it with top profiles", "Working out your score"];

function looksLikeProfileLink(value: string) {
  return /^(https?:\/\/)?(www\.)?upwork\.com\/(freelancers|fl)\/[^/\s?#]+/i.test(value.trim());
}

export function ScoreForm({ signedIn }: { signedIn: boolean }) {
  const [profileUrl, setProfileUrl] = useState("");
  const [overview, setOverview] = useState("");
  const [email, setEmail] = useState("");
  const [waCountry, setWaCountry] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<ScoreFieldErrors>({});
  const [result, setResult] = useState<ProfileScoreResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const guess = guessCountry();
    if (guess) setWaCountry(c => c || guess);
  }, []);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const timer = window.setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 4500);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!result) return;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [result]);

  const clear = (key: ScoreFieldKey) => setFields(f => (f[key] ? { ...f, [key]: undefined } : f));
  const overviewLength = overview.trim().length;

  // The button only switches on once everything the server will ask for is present. What is still
  // missing is spelled out under it, so a disabled button never leaves anyone guessing.
  const missing: string[] = [];
  if (!looksLikeProfileLink(profileUrl)) missing.push("your Upwork profile link");
  if (overviewLength < OVERVIEW_MIN) missing.push("your overview");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) missing.push("your email");
  if (!waCountry || waNumber.replace(/\D/g, "").length < 6) missing.push("your WhatsApp number");
  if (!consent) missing.push("your agreement below");
  const ready = missing.length === 0 && overviewLength <= OVERVIEW_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError(""); setFields({});
    try {
      const response = await fetch("/api/profile-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: crypto.randomUUID(), profileUrl, overview, email,
          whatsappCountry: waCountry, whatsappNumber: waNumber, consent, website,
        }),
      });
      const body = await response.json() as { result?: ProfileScoreResult; error?: string; fields?: ScoreFieldErrors };
      if (!response.ok || !body.result) {
        if (body.fields && Object.keys(body.fields).length) setFields(body.fields);
        throw new Error(body.error || "We couldn't score your profile right now. Please try again.");
      }
      setResult(body.result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't score your profile right now. Please try again.");
    } finally {
      setBusy(false);
    }
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
          <label htmlFor="ps-overview">Your profile overview</label>
          <p className="ix-l-field-help">Upwork only shows your title and stats to people who aren&apos;t signed in, so paste the overview text from your profile here.</p>
          <Textarea id="ps-overview" className="ix-ps-overview" maxLength={OVERVIEW_MAX} value={overview} disabled={busy}
            onChange={e => { setOverview(e.target.value); clear("overview"); }}
            aria-invalid={!!fields.overview || undefined} aria-describedby={describe("overview") ?? "ps-overview-count"}
            placeholder="Paste the overview (the About section) from your Upwork profile." />
          <p className="ix-l-field-count" id="ps-overview-count" aria-live="polite" data-ok={overviewLength >= OVERVIEW_MIN ? "true" : undefined}>
            {overviewLength < OVERVIEW_MIN ? `${OVERVIEW_MIN - overviewLength} more characters needed` : `${overviewLength.toLocaleString("en-US")} characters`}
          </p>
          {fieldError("overview")}
        </div>

        <div className="ix-ps-two">
          <div className="ix-l-field">
            <label htmlFor="ps-email">Email</label>
            <Input id="ps-email" type="email" autoComplete="email" maxLength={254} value={email} disabled={busy}
              onChange={e => { setEmail(e.target.value); clear("email"); }}
              aria-invalid={!!fields.email || undefined} aria-describedby={describe("email")} placeholder="you@example.com" />
            {fieldError("email")}
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
        </div>

        <div className="ix-l-honeypot" aria-hidden="true"><label htmlFor="ps-website">Website</label><input id="ps-website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></div>

        <label className="ix-l-consent" htmlFor="ps-consent">
          <Checkbox id="ps-consent" checked={consent} disabled={busy} onCheckedChange={v => { setConsent(v === true); clear("consent"); }}
            aria-invalid={!!fields.consent || undefined} aria-describedby={describe("consent")} />
          <span>I agree to share my email and WhatsApp number with Improvexus and to be contacted about my profile score.</span>
        </label>
        {fieldError("consent")}

        {error && <p className="ix-l-error" role="alert"><CircleAlert size={15} className="ix-ps-inline-icon" />{error}</p>}

        <button type="submit" className="ix-l-btn-solid ix-l-submit ix-ps-submit" disabled={!ready || busy}>
          {busy ? <><LoaderCircle size={16} className="ix-ps-spin" /> Scoring your profile…</> : <>Score my profile <ArrowRight size={15} /></>}
        </button>
        {!busy && !ready && <p className="ix-ps-missing">To switch this on, add {missing.length ? joinList(missing) : "a shorter overview"}.</p>}
        {busy && (
          <ol className="ix-ps-steps" aria-live="polite">
            {STEPS.map((label, i) => (
              <li key={label} data-state={i < step ? "done" : i === step ? "active" : "todo"}>
                {i < step ? <CircleCheck size={15} /> : i === step ? <LoaderCircle size={15} className="ix-ps-spin" /> : <CircleDashed size={15} />}
                {label}
              </li>
            ))}
          </ol>
        )}
      </form>

      {result ? (
        <ScoreResult result={result} auditHref={auditHref} signedIn={signedIn} innerRef={resultRef} />
      ) : (
        <aside className="ix-ps-aside">
          <h2>What you get</h2>
          <ul>
            <li>A score out of 100, measured against the pattern top Upwork profiles follow.</li>
            <li>Points for your title, track record, opening lines, structure, proof and closing.</li>
            <li>The three changes that would raise your score the most.</li>
          </ul>
          <p>It&apos;s free and takes about half a minute. Your overview is used only to work out your score.</p>
        </aside>
      )}
    </div>
  );
}

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function ScoreResult({ result, auditHref, signedIn, innerRef }: { result: ProfileScoreResult; auditHref: string; signedIn: boolean; innerRef: React.RefObject<HTMLDivElement | null> }) {
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
          {result.assessedPoints < 100 && <p className="ix-ps-partial">Based on the {result.assessedPoints} of 100 points we could check. The rest is marked below.</p>}
        </div>
      </div>

      <ul className="ix-ps-sections">
        {result.sections.map(section => (
          <li key={section.id} data-checked={section.checked ? "true" : "false"}>
            <div className="ix-ps-row">
              <span>{section.label}</span>
              <b>{section.checked ? `${section.points} of ${section.max}` : "Not checked"}</b>
            </div>
            {section.checked && <div className="ix-ps-bar" aria-hidden="true"><i style={{ width: `${Math.round(((section.points ?? 0) / section.max) * 100)}%` }} /></div>}
            {section.note && <p>{section.note}</p>}
            {section.id === "track" && result.track && (
              <dl className="ix-ps-track">
                {result.track.lines.map(line => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}
              </dl>
            )}
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
