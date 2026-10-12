"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";
import { EmailQuotaNotice, useEmailQuota, type Quota } from "@/app/auth/email-quota";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [upworkLink, setUpworkLink] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — real people never see or fill it
  const quota = useEmailQuota();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (quota.locked) return;
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Use at least 8 characters, including a letter and a number.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, mobile, upworkLink, email, password, website }),
      });
      const result = await response.json() as { error?: string; code?: string; needsVerification?: boolean; quota?: Quota | null; retryAfterSeconds?: number };
      quota.fromResponse(result);
      if (!response.ok) throw new Error(result.error || "Signup could not be completed.");
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Signup could not be completed.");
    } finally {
      setSubmitting(false);
    }
    // NOTE: nothing clears the form fields on failure. Preserving what the person typed when
    // validation fails is a requirement of the brief, and the commonest way to break it is a
    // well-meaning reset in this handler.
  }

  if (done) {
    return (
      <AuthShell
        title="Check your email"
        // Was passed as a plain child before, with a stray `var(--ix-heading)` that isn't a
        // defined custom property anywhere in auth.css (the real one is --ix-a-fg). Two effects:
        // the color fix was a no-op (the .ix-subtitle strong rule already sets the right color),
        // but placing it outside AuthShell's heading block meant it picked up the 22px gap
        // .ix-auth__col uses between sections instead of the 8px gap every other auth screen's
        // title+subtitle pair uses — this is the "alignment" the spacing looked off on. Passing
        // it as `subtitle` puts it back inside .ix-auth__heading with the rest.
        subtitle={<>
          We sent a verification link to <strong>{email}</strong>. Open it to finish creating your
          account. You choose your own password, and nobody at Improvexus can see it.
        </>}
      >
        {/* The resend lives HERE rather than on the sign-in page: this is the one moment where
            somebody genuinely has a missing verification email and nothing else to do about it. */}
        <p className="ix-auth__links">
          <span>Didn&apos;t get it? <Link href="/verify">Resend the verification email</Link></span>
          <span><Link href="/login">Back to sign in</Link></span>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your Improvexus account"
      subtitle={<>Already have an account? <Link href="/login">Sign in</Link>.</>}
    >
      <form className="ix-auth__form" onSubmit={submit} noValidate>
        <div className="ix-auth__fields">
          {/* Name and mobile sit two-up on desktop and stack on phones — see .ix-auth__row. */}
          <div className="ix-auth__row">
            <AuthField label="Full name" htmlFor="ix-name">
              <input id="ix-name" className="ix-input" value={fullName} onChange={e => setFullName(e.target.value)}
                required maxLength={120} autoComplete="name" />
            </AuthField>
            <AuthField label="Mobile number" htmlFor="ix-mobile">
              <input id="ix-mobile" className="ix-input" type="tel" value={mobile} onChange={e => setMobile(e.target.value)}
                required maxLength={30} autoComplete="tel" placeholder="+92 3xx xxxxxxx" />
            </AuthField>
          </div>
          <AuthField
            label="Upwork profile link"
            htmlFor="ix-upwork"
            help="Optional. You can add or change this later from your account."
          >
            <input id="ix-upwork" className="ix-input" value={upworkLink} onChange={e => setUpworkLink(e.target.value)}
              maxLength={300} placeholder="https://www.upwork.com/freelancers/…" />
          </AuthField>
          <AuthField label="Email" htmlFor="ix-email">
            <input id="ix-email" className="ix-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              required maxLength={254} autoComplete="email" placeholder="you@example.com" />
          </AuthField>
          <AuthField label="Password" htmlFor="ix-password" help="At least 8 characters, including a letter and a number.">
            <input id="ix-password" className="ix-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} maxLength={200} autoComplete="new-password" />
          </AuthField>
        </div>

        <div className="ix-auth-trap" aria-hidden="true">
          <label htmlFor="ix-website">Website</label>
          <input id="ix-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
        </div>

        <EmailQuotaNotice state={quota} />
        {error && !quota.locked && <p role="alert" className="ix-auth__error">{error}</p>}

        <div className="ix-auth__actions">
          <button type="submit" className="ix-btn ix-btn--primary" disabled={submitting || quota.locked}>
            {submitting ? "Creating account…" : quota.locked ? `Try again in ${quota.clock}` : "Create account"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
