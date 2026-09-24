"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";
import { EmailQuotaNotice, useEmailQuota } from "@/app/auth/email-quota";

export default function ResetPasswordRequestPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const quota = useEmailQuota();

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
        <p className="ix-auth-subtitle">If an account exists for {email}, a password reset link is on its way.</p>
        <Link href="/login" className="ix-auth-links-center">Back to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we'll send you a reset link.">
      <form onSubmit={submit}>
        <AuthField label="Email" htmlFor="ix-email">
          <Input id="ix-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} autoComplete="email" placeholder="you@example.com" />
        </AuthField>
        <EmailQuotaNotice state={quota} />
        {error && !quota.locked && <p role="alert" className="ix-auth-error">{error}</p>}
        <Button type="submit" disabled={submitting || quota.locked} className="mt-2">{submitting ? "Sending…" : "Send reset link"}</Button>
      </form>
      <Link href="/login" className="ix-auth-links-center">Back to sign in</Link>
    </AuthShell>
  );
}
