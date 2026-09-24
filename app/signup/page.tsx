"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [upworkLink, setUpworkLink] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, mobile, upworkLink, email, password }),
      });
      const result = await response.json() as { error?: string; needsVerification?: boolean };
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
      <AuthShell title="Check your email">
        <p className="ix-subtitle">
          We sent a verification link to <strong style={{ color: "var(--ix-heading)" }}>{email}</strong>.
          Open it to finish creating your account — you choose your own password, and nobody at
          Improvexus can see it.
        </p>
        <p className="ix-auth__links"><Link href="/login">Back to sign in</Link></p>
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
          <AuthField label="Password" htmlFor="ix-password" help="At least 8 characters.">
            <input id="ix-password" className="ix-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} maxLength={200} autoComplete="new-password" />
          </AuthField>
        </div>

        {error && <p role="alert" className="ix-auth__error">{error}</p>}

        <div className="ix-auth__actions">
          <button type="submit" className="ix-btn ix-btn--primary" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
