"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";
import { EmailQuotaNotice, useEmailQuota } from "@/app/auth/email-quota";

export default function ResetPasswordRequestPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const quota = useEmailQuota();

  // /auth/callback sends an expired, reused or wrong-browser reset link back here with ?error=,
  // so the person sees why and can request a fresh link on the same screen.
  useEffect(() => {
    const message = new URLSearchParams(window.location.search).get("error");
    if (message) setError(message.slice(0, 300));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (quota.locked) return;
    setSubmitting(true);
    try {
      // Through our server so reset emails count toward this browser's email limit.
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { error?: string; code?: string };
      quota.fromResponse(result);
      if (!response.ok) throw new Error(result.error || "The reset link could not be sent.");
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
        <EmailQuotaNotice state={quota} />
        {error && !quota.locked && <p role="alert" className="ix-auth__error">{error}</p>}
        <div className="ix-auth__actions">
          <button type="submit" className="ix-btn ix-btn--primary" disabled={submitting || quota.locked}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </div>
      </form>
      <p className="ix-auth__links"><Link href="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
