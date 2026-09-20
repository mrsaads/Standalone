"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { profileSchema, type Profile } from "@/lib/audit";

export function Enquiry({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [budget, setBudget] = useState(""); const [challenge, setChallenge] = useState("");
  const [intent, setIntent] = useState("exploring"); const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [receipt, setReceipt] = useState("");
  const [website, setWebsite] = useState(""); const submissionId = useRef("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    if (!consent) {setError("Please agree to share your enquiry so Improvexus can review it."); return;}
    const parsed = profileSchema.safeParse(profile); if (!parsed.success) { setError("Please check your profile information and try again."); return; }
    setSaving(true); setError("");
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId: submissionId.current, name, email, budget, challenge, intent, consent, website, profile }) });
      const result = await response.json() as {error?: string; reference?: string};
      if (!response.ok || typeof result.reference !== "string") throw new Error(result.error || "Your enquiry could not be saved. Please try again.");
      setReceipt(result.reference);
    } catch (err) { setError(err instanceof Error ? err.message : "Your enquiry could not be saved. Please try again."); }
    finally { setSaving(false); }
  }
  return <section id="enquiry" className="enquiry-panel">{receipt ? <div className="success-message" role="status"><span className="success-icon"><Check size={27} /></span><h2>Your enquiry is saved.</h2><p>Your contact details and supplied profile information are ready for Improvexus to review. This does not book a call or confirm a service.</p><p className="receipt">Reference: {receipt}</p><Button variant="outline" onClick={onClose}>Return to the audit</Button></div> : <form onSubmit={submit}><div className="section-title"><div><span className="eyebrow">LET’S CHECK THE FIT</span><h2>What kind of help would move you forward?</h2></div><Button type="button" variant="ghost" onClick={onClose}>Close</Button></div><p className="enquiry-intro">Share your profile context with Improvexus to discuss profile improvement, bidding support, or business development.</p><div className="field-row"><div className="field"><label htmlFor="contact-name">Your name <span>*</span></label><Input id="contact-name" required autoComplete="name" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div><div className="field"><label htmlFor="contact-email">Email <span>*</span></label><Input id="contact-email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></div></div><div className="field-row"><div className="field"><label htmlFor="intent">What are you considering?</label><Select value={intent} onValueChange={setIntent}><SelectTrigger id="intent" className="full-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="exploring">Exploring my options</SelectItem><SelectItem value="one_time">One-time profile help</SelectItem><SelectItem value="ongoing">Ongoing acquisition support</SelectItem></SelectContent></Select></div><div className="field"><label htmlFor="budget">Budget, including currency <span className="optional">Optional</span></label><Input id="budget" maxLength={100} value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. PKR 50,000 per month" /></div></div><div className="field"><label htmlFor="challenge">Where are you getting stuck? <span className="optional">Optional</span></label><Textarea id="challenge" maxLength={1200} value={challenge} onChange={e => setChallenge(e.target.value)} placeholder="e.g. I send proposals but rarely get replies. Include recent proposal or outreach numbers if you know them." /></div><div className="honeypot" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></div><label htmlFor="consent" className="consent"><Checkbox id="consent" checked={consent} onCheckedChange={value => setConsent(value === true)} /><span>I agree to share these contact details and supplied profile information with Improvexus, and to be contacted about this enquiry.</span></label><p className="field-help">This saves your contact details and up to 6,000 characters of profile text. Attached images remain local. Only include information you want the team to review.</p>{error && <p role="alert" className="form-error">{error}</p>}<Button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving your enquiry…" : "Send my enquiry"}<ArrowRight size={17} /></Button></form>}</section>;
}
