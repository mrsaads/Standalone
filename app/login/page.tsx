"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // Supabase returns a distinct "Email not confirmed" error for unverified accounts —
        // surfaced as-is, since the fix (check your email) differs from a wrong password.
        throw new Error(signInError.message);
      }
      // A hard navigation, not router.push()+router.refresh(): the App Router's client-side
      // navigation has been observed to silently no-op right after an auth cookie changes out from
      // under it (the push resolves, the cookie is set, but the route never re-renders) — a full
      // navigation always picks up the fresh session server-side.
      window.location.href = "/";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in to Improvexus"
      subtitle={<>Audit your Upwork profile and track your managed profile in one place.</>}
    >
      {/* NOTE: no social sign-in buttons. The reference layout has a four-up OAuth grid, but no
          OAuth provider is configured on this project, so showing one would be a button that
          cannot work. The brief is explicit: only show authentication methods that actually work. */}
      <form className="ix-auth__form" onSubmit={submit} noValidate>
        <div className="ix-auth__fields">
          <AuthField label="Email" htmlFor="ix-email">
            <input
              id="ix-email"
              className="ix-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              maxLength={254}
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={error ? true : undefined}
            />
          </AuthField>
          <AuthField label="Password" htmlFor="ix-password">
            <input
              id="ix-password"
              className="ix-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-invalid={error ? true : undefined}
            />
          </AuthField>
        </div>

        {/* role=alert so the failure is announced, not just drawn. */}
        {error && <p role="alert" className="ix-auth__error">{error}</p>}

        <div className="ix-auth__actions">
          <button type="submit" className="ix-btn ix-btn--primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>

      <p className="ix-auth__links">
        <span>Need an account? <Link href="/signup">Create one</Link></span>
        <span>Forgot your password? <Link href="/reset-password">Reset it</Link></span>
        <span>Didn&apos;t get the verification email? <Link href="/verify">Resend it</Link></span>
      </p>
    </AuthShell>
  );
}
