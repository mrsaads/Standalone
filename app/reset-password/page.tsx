"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";

export default function ResetPasswordRequestPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password/confirm`,
      });
      if (resetError) throw new Error(resetError.message);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The reset link could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email">
        <p className="ix-subtitle">
          If an account exists for {email}, a password reset link is on its way. The wording is
          deliberately vague: confirming which addresses have accounts would let anyone test for
          your customers.
        </p>
        <p className="ix-auth__links"><Link href="/login">Back to sign in</Link></p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we'll send you a reset link.">
      <form className="ix-auth__form" onSubmit={submit} noValidate>
        <div className="ix-auth__fields">
          <AuthField label="Email" htmlFor="ix-email">
            <input id="ix-email" className="ix-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              required maxLength={254} autoComplete="email" placeholder="you@example.com" />
          </AuthField>
        </div>
        {error && <p role="alert" className="ix-auth__error">{error}</p>}
        <div className="ix-auth__actions">
          <button type="submit" className="ix-btn ix-btn--primary" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </div>
      </form>
      <p className="ix-auth__links"><Link href="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
