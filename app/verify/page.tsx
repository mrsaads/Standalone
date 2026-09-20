"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <AuthField label="Email" htmlFor="ix-email">
        <Input id="ix-email" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} autoComplete="email" placeholder="you@example.com" />
      </AuthField>
      {error && <p role="alert" className="ix-auth-error">{error}</p>}
      {sent ? (
        <p className="ix-auth-subtitle">If that account needs verifying, a new link is on its way.</p>
      ) : (
        <Button type="button" disabled={sending || !email} onClick={resend} className="mt-2">
          {sending ? "Sending…" : "Resend verification email"}
        </Button>
      )}
      <Link href="/login" className="ix-auth-links-center">Back to sign in</Link>
    </AuthShell>
  );
}
