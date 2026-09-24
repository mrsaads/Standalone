"use client";
import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";

// Landing page for someone who signed up but hasn't clicked the verification link yet (e.g. they
// tried to sign in and got Supabase's "Email not confirmed" error, or navigated here directly).
// Lets them resend the verification email without exposing whether the given address exists.
export default function VerifyPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function resend() {
    setError("");
    setSending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
      });
      if (resendError) throw new Error(resendError.message);
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
        {error && <p role="alert" className="ix-auth__error">{error}</p>}
        {sent ? (
          <p role="status" className="ix-auth__success">If that account needs verifying, a new link is on its way.</p>
        ) : (
          <div className="ix-auth__actions">
            <button type="button" className="ix-btn ix-btn--primary" disabled={sending || !email} onClick={resend}>
              {sending ? "Sending…" : "Resend verification email"}
            </button>
          </div>
        )}
      </div>
      <p className="ix-auth__links"><Link href="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
