"use client";
import { useState } from "react";
import Link from "next/link";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";
import { EmailQuotaNotice, useEmailQuota } from "@/app/auth/email-quota";

// Landing page for someone who signed up but hasn't clicked the verification link yet (e.g. they
// tried to sign in and got Supabase's "Email not confirmed" error, or navigated here directly).
// Lets them resend the verification email without exposing whether the given address exists.
export default function VerifyPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const quota = useEmailQuota();

  async function resend() {
    setError("");
    if (quota.locked) return;
    setSending(true);
    try {
      // Through our server, not straight to Supabase, so the per-browser email limit applies.
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { error?: string; code?: string };
      quota.fromResponse(result);
      if (!response.ok) throw new Error(result.error || "The verification email could not be resent.");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The verification email could not be resent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell title="Verify your email" subtitle="Check your inbox for the link we sent when you signed up.">
      <div className="ix-auth__form">
        <div className="ix-auth__fields">
          <AuthField label="Email" htmlFor="ix-email">
            <input id="ix-email" className="ix-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              maxLength={254} autoComplete="email" placeholder="you@example.com" />
          </AuthField>
        </div>
        <EmailQuotaNotice state={quota} />
        {error && !quota.locked && <p role="alert" className="ix-auth__error">{error}</p>}
        {sent ? (
          <p role="status" className="ix-auth__success">If that account needs verifying, a new link is on its way.</p>
        ) : (
          <div className="ix-auth__actions">
            <button type="button" className="ix-btn ix-btn--primary" disabled={sending || !email || quota.locked} onClick={resend}>
              {sending ? "Sending…" : "Resend verification email"}
            </button>
          </div>
        )}
      </div>
      <p className="ix-auth__links"><Link href="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
