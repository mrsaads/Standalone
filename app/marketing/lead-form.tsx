"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DIAL_COUNTRIES, PRIORITY_DIAL_ISOS, dialCountry } from "@/lib/marketing/dial-codes";

// The public enquiry form. Used on the landing page, every service screen and every location page.
//
// Every field is mandatory. The browser-side checks here exist only to save a round trip — the
// rules themselves live in lib/leads.ts and are enforced on the server, which returns one message
// per field; this form shows each of those under the input it belongs to.

type Source = "landing_general" | "landing_service" | "landing_location";
type FieldKey = "name" | "email" | "mobile" | "whatsapp" | "profileLink" | "goals" | "consent";
type FieldErrors = Partial<Record<FieldKey, string>>;

const GOALS_MIN = 20;

// A best guess at the visitor's country, purely to preselect the calling code. Never sent anywhere
// on its own, and always overridable — the person's own choice is what gets submitted.
const ZONE_TO_ISO: Record<string, string> = {
  "Asia/Karachi": "PK", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Dhaka": "BD", "Europe/London": "GB", "Europe/Dublin": "IE",
  "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Singapore": "SG", "Asia/Manila": "PH", "Africa/Lagos": "NG", "Africa/Nairobi": "KE",
  "Africa/Accra": "GH", "Africa/Johannesburg": "ZA", "Pacific/Auckland": "NZ", "America/Toronto": "CA", "America/Vancouver": "CA",
  "America/Edmonton": "CA", "America/Winnipeg": "CA",
};
function guessCountry(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ZONE_TO_ISO[zone]) return ZONE_TO_ISO[zone];
    if (zone.startsWith("Australia/")) return "AU";
    if (zone.startsWith("America/")) return "US";
    const region = new Intl.Locale(navigator.language).region;
    if (region && dialCountry(region)) return region;
  } catch { /* fall through to no preselection */ }
  return "";
}

// The full list is ~200 rows and the form has two pickers. Rendering it on the server would put
// 400 identical <option> lines into the HTML of every public page; it is filled in after mount
// instead, with the common countries (and whatever is already selected) present from the start.
function CountrySelect({ id, value, onChange, disabled, invalid, label, full }: { id: string; value: string; onChange: (iso: string) => void; disabled?: boolean; invalid?: boolean; label: string; full: boolean }) {
  const priority = useMemo(() => PRIORITY_DIAL_ISOS.map(iso => dialCountry(iso)!).filter(Boolean), []);
  const selected = dialCountry(value);
  const selectedMissing = !full && selected && !PRIORITY_DIAL_ISOS.includes(selected.iso as (typeof PRIORITY_DIAL_ISOS)[number]);
  return (
    <select id={id} className="ix-l-select" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} required aria-label={label} aria-invalid={invalid || undefined} autoComplete="tel-country-code">
      <option value="" disabled>Country code</option>
      <optgroup label="Most common">
        {priority.map(c => <option key={`p-${c.iso}`} value={c.iso}>{c.name} (+{c.dial})</option>)}
        {selectedMissing && <option value={selected.iso}>{selected.name} (+{selected.dial})</option>}
      </optgroup>
      {full && (
        <optgroup label="All countries">
          {DIAL_COUNTRIES.filter(c => !PRIORITY_DIAL_ISOS.includes(c.iso as (typeof PRIORITY_DIAL_ISOS)[number])).map(c => <option key={c.iso} value={c.iso}>{c.name} (+{c.dial})</option>)}
        </optgroup>
      )}
    </select>
  );
}

export function LeadForm({ source = "landing_general", sourcePage = "/", defaultCountry = "", cta = "Let's work on your Upwork growth" }: { source?: Source; sourcePage?: string; defaultCountry?: string; cta?: string }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [mobileCountry, setMobileCountry] = useState(defaultCountry); const [mobileNumber, setMobileNumber] = useState("");
  const [sameAsMobile, setSameAsMobile] = useState(true);
  const [whatsappCountry, setWhatsappCountry] = useState(defaultCountry); const [whatsappNumber, setWhatsappNumber] = useState("");
  const [profileLink, setProfileLink] = useState(""); const [goals, setGoals] = useState("");
  const [consent, setConsent] = useState(false); const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [fields, setFields] = useState<FieldErrors>({});
  const [receipt, setReceipt] = useState("");
  const submissionId = useRef("");
  const receiptRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Preselect the calling code after mount (not during render) so server and client HTML match.
  useEffect(() => {
    setMounted(true);
    if (defaultCountry) return;
    const guess = guessCountry();
    if (guess) { setMobileCountry(c => c || guess); setWhatsappCountry(c => c || guess); }
  }, [defaultCountry]);

  // After a failed submit, put the cursor in the first field that needs attention. On a phone the
  // form is taller than the screen, so without this the person sees only "3 fields need fixing"
  // beside the button and has to scroll up hunting for them.
  function focusFirst(found: FieldErrors) {
    const order: [FieldKey, string][] = [
      ["name", "lead-name"], ["email", "lead-email"],
      ["mobile", mobileCountry ? "lead-mobile" : "lead-mobile-country"],
      ["whatsapp", sameAsMobile ? "lead-whatsapp-same" : (whatsappCountry ? "lead-whatsapp" : "lead-whatsapp-country")],
      ["profileLink", "lead-link"], ["goals", "lead-goals"], ["consent", "lead-consent"],
    ];
    const first = order.find(([key]) => found[key]);
    if (!first) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(first[1]);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }

  // The confirmation replaces the whole form; move focus to it so a screen reader announces it and
  // a phone that was scrolled to the submit button is not left looking at empty space.
  useEffect(() => {
    if (!receipt) return;
    receiptRef.current?.focus({ preventScroll: true });
    receiptRef.current?.scrollIntoView({ block: "center" });
  }, [receipt]);

  // A field's error clears the moment the person starts fixing it — a stale message under a field
  // that is now correct reads as "I fixed it and it's still wrong".
  const clear = (key: FieldKey) => setFields(f => (f[key] ? { ...f, [key]: undefined } : f));

  const waCountry = sameAsMobile ? mobileCountry : whatsappCountry;
  const waNumber = sameAsMobile ? mobileNumber : whatsappNumber;

  function localCheck(): FieldErrors {
    const found: FieldErrors = {};
    if (name.trim().length < 2) found.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) found.email = "Enter a valid email address.";
    if (!mobileCountry) found.mobile = "Choose the country code for your mobile number.";
    else if (mobileNumber.replace(/\D/g, "").length < 4) found.mobile = "Enter your mobile number.";
    if (!waCountry) found.whatsapp = "Choose the country code for your WhatsApp number.";
    else if (waNumber.replace(/\D/g, "").length < 4) found.whatsapp = "Enter your WhatsApp number.";
    if (!profileLink.trim()) found.profileLink = "Paste the link to your Upwork profile.";
    if (goals.trim().length < GOALS_MIN) found.goals = `Tell us what you want help with — at least ${GOALS_MIN} characters, so we can give you a useful answer.`;
    if (!consent) found.consent = "Please agree to share your details so Improvexus can contact you.";
    return found;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const found = localCheck();
    const count = Object.keys(found).length;
    if (count > 0) { setFields(found); setError(""); focusFirst(found); return; }
    setSaving(true); setError(""); setFields({});
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submissionId.current, name, email,
          mobileCountry, mobileNumber, whatsappCountry: waCountry, whatsappNumber: waNumber,
          profileLink, goals, source, sourcePage, consent, website,
        }),
      });
      const result = await response.json() as { error?: string; reference?: string; fields?: FieldErrors };
      if (!response.ok || typeof result.reference !== "string") {
        // Field-level problems are shown under their fields and counted in the summary below; only a
        // failure with no field attached (rate limit, outage) needs its own message.
        if (result.fields && Object.keys(result.fields).length > 0) { setFields(result.fields); focusFirst(result.fields); return; }
        throw new Error(result.error || "Your enquiry could not be saved. Please try again.");
      }
      setReceipt(result.reference);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your enquiry could not be saved. Please try again."); }
    finally { setSaving(false); }
  }

  if (receipt) {
    return (
      <div className="ix-l-enquiry-form ix-l-receipt" role="status" tabIndex={-1} ref={receiptRef} id="enquiry">
        <Check size={26} />
        <strong>Your enquiry is saved.</strong>
        <p style={{ color: "var(--ix-l-muted)", fontSize: 14 }}>Improvexus will review it and get back to you by email or WhatsApp. This does not book a call or confirm a service.</p>
        <p style={{ color: "var(--ix-l-muted-2)", fontSize: 12.5, marginTop: 10 }}>Reference: {receipt}</p>
      </div>
    );
  }

  // Counted live from the fields that still have a message, so it shrinks as each one is fixed and
  // disappears with the last — never a stale "7 fields need fixing" over a form that is now correct.
  const open = Object.values(fields).filter(Boolean).length;
  const summary = open > 0 ? (open === 1 ? "1 field above needs fixing." : `${open} fields above need fixing.`) : error;
  const fieldError = (key: FieldKey) => fields[key] ? <p className="ix-l-field-error" role="alert" id={`lead-${key}-error`}>{fields[key]}</p> : null;
  const dial = (iso: string) => dialCountry(iso)?.dial;
  // Ties each input to its message, so assistive technology reads the error with the field.
  const describe = (key: FieldKey) => (fields[key] ? `lead-${key}-error` : undefined);
  const goalsLength = goals.trim().length;

  return (
    <form className="ix-l-enquiry-form" onSubmit={submit} noValidate id="enquiry">
      <p className="ix-l-form-note">All fields are required.</p>

      <div className="ix-l-field">
        <label htmlFor="lead-name">Your name</label>
        <Input id="lead-name" required maxLength={100} autoComplete="name" value={name} onChange={e => { setName(e.target.value); clear("name"); }} aria-invalid={!!fields.name || undefined} aria-describedby={describe("name")} />
        {fieldError("name")}
      </div>

      <div className="ix-l-field">
        <label htmlFor="lead-email">Email</label>
        <Input id="lead-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); clear("email"); }} aria-invalid={!!fields.email || undefined} aria-describedby={describe("email")} placeholder="you@example.com" />
        {fieldError("email")}
      </div>

      <div className="ix-l-field">
        <label htmlFor="lead-mobile">Mobile number</label>
        <div className="ix-l-phone">
          <CountrySelect full={mounted} id="lead-mobile-country" label="Country code for your mobile number" value={mobileCountry} invalid={!!fields.mobile} onChange={iso => { setMobileCountry(iso); clear("mobile"); if (sameAsMobile) clear("whatsapp"); }} />
          <Input id="lead-mobile" type="tel" inputMode="tel" required maxLength={20} autoComplete="tel-national" value={mobileNumber} onChange={e => { setMobileNumber(e.target.value); clear("mobile"); if (sameAsMobile) clear("whatsapp"); }} aria-invalid={!!fields.mobile || undefined} aria-describedby={describe("mobile")} placeholder={mobileCountry === "PK" ? "300 1234567" : "Phone number"} />
        </div>
        {fieldError("mobile")}
      </div>

      <div className="ix-l-field">
        <label htmlFor="lead-whatsapp">WhatsApp number</label>
        <label className="ix-l-inline-check" htmlFor="lead-whatsapp-same">
          <Checkbox id="lead-whatsapp-same" checked={sameAsMobile} onCheckedChange={v => { setSameAsMobile(v === true); clear("whatsapp"); }} />
          <span>My WhatsApp number is the same as my mobile number</span>
        </label>
        <div className="ix-l-phone">
          <CountrySelect full={mounted} id="lead-whatsapp-country" label="Country code for your WhatsApp number" value={waCountry} disabled={sameAsMobile} invalid={!!fields.whatsapp} onChange={iso => { setWhatsappCountry(iso); clear("whatsapp"); }} />
          <Input id="lead-whatsapp" type="tel" inputMode="tel" required maxLength={20} autoComplete="tel-national" value={waNumber} disabled={sameAsMobile} onChange={e => { setWhatsappNumber(e.target.value); clear("whatsapp"); }} aria-invalid={!!fields.whatsapp || undefined} aria-describedby={describe("whatsapp")} placeholder="WhatsApp number" />
        </div>
        {waCountry && waNumber.replace(/\D/g, "").length >= 4 && !fields.whatsapp && (
          <p className="ix-l-field-help">We&apos;ll message +{dial(waCountry)} {waNumber.replace(/\D/g, "").replace(waCountry === "IT" ? /^$/ : /^0+/, "")} on WhatsApp.</p>
        )}
        {fieldError("whatsapp")}
      </div>

      <div className="ix-l-field">
        <label htmlFor="lead-link">Upwork profile link</label>
        <Input id="lead-link" required maxLength={500} inputMode="url" autoComplete="url" value={profileLink} onChange={e => { setProfileLink(e.target.value); clear("profileLink"); }} aria-invalid={!!fields.profileLink || undefined} aria-describedby={describe("profileLink")} placeholder="https://www.upwork.com/freelancers/…" />
        {fieldError("profileLink")}
      </div>

      <div className="ix-l-field">
        <label htmlFor="lead-goals">What do you need help with?</label>
        <Textarea id="lead-goals" required maxLength={1200} value={goals} onChange={e => { setGoals(e.target.value); clear("goals"); }} aria-invalid={!!fields.goals || undefined} aria-describedby={describe("goals")} placeholder="e.g. I send 15 proposals a week for CRM migration projects and get almost no replies." />
        {goalsLength > 0 && goalsLength < GOALS_MIN && !fields.goals && <p className="ix-l-field-count" aria-live="polite">{GOALS_MIN - goalsLength} more character{GOALS_MIN - goalsLength === 1 ? "" : "s"} needed</p>}
        {fieldError("goals")}
      </div>

      <div className="ix-l-honeypot" aria-hidden="true"><label htmlFor="lead-website">Website</label><input id="lead-website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></div>

      <label className="ix-l-consent" htmlFor="lead-consent">
        <Checkbox id="lead-consent" checked={consent} onCheckedChange={v => { setConsent(v === true); clear("consent"); }} aria-invalid={!!fields.consent || undefined} aria-describedby={describe("consent")} />
        <span>I agree to share these details with Improvexus and to be contacted about this enquiry by email, phone or WhatsApp.</span>
      </label>
      {fieldError("consent")}

      {summary && <p className="ix-l-error" role="alert"><CircleAlert size={15} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />{summary}</p>}
      <button type="submit" className="ix-l-btn-solid ix-l-submit" disabled={saving}>
        {saving ? "Sending…" : cta} <ArrowRight size={15} />
      </button>
    </form>
  );
}
