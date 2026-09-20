"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        {error && <p role="alert" className="ix-auth-error">{error}</p>}
        <Button type="submit" disabled={submitting} className="mt-2">{submitting ? "Sending…" : "Send reset link"}</Button>
      </form>
      <Link href="/login" className="ix-auth-links-center">Back to sign in</Link>
    </AuthShell>
  );
}
