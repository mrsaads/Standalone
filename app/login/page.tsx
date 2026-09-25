"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";
import { useLockCountdown } from "@/app/auth/email-quota";

function LoginInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(() => {
    const reason = params.get("reason");
    if (reason === "idle") return "You were signed out after a period of inactivity. Please sign in again.";
    if (reason === "expired") return "Your session has expired. Please sign in again.";
    return params.get("error") ?? "";
  });
  const lock = useLockCountdown();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (lock.locked) return;
    setSubmitting(true);
    try {
      // Signed in on the server (which sets the session cookies) so repeated wrong passwords can
      // be locked out — see app/api/auth/login/route.ts.
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { error?: string; code?: string; retryAfterSeconds?: number };
      if (!response.ok) {
        if (result.code === "LOGIN_LOCKED" && result.retryAfterSeconds) lock.lockFor(result.retryAfterSeconds);
        throw new Error(result.error || "Sign in failed.");
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
          <button type="submit" className="ix-btn ix-btn--primary" disabled={submitting || lock.locked}>
            {submitting ? "Signing in…" : lock.locked ? `Try again in ${lock.clock}` : "Sign in"}
          </button>
        </div>
      </form>

      {/* No "resend verification" link here on purpose. Someone signing in either has a verified
          account or gets Supabase's "Email not confirmed" error, which already tells them what to
          do; offering a resend to everyone puts an email-sending action in front of people who
          have no reason for it and eats into the per-browser email budget. The resend lives where
          it is actually needed — on the "check your email" screen right after signing up (see
          app/signup/page.tsx) and at /verify. */}
      <p className="ix-auth__links">
        <span>Need an account? <Link href="/signup">Create one</Link></span>
        <span>Forgot your password? <Link href="/reset-password">Reset it</Link></span>
      </p>
    </AuthShell>
  );
}

// useSearchParams() needs a Suspense boundary for this page to prerender.
export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell title="Sign in to Improvexus">{null}</AuthShell>}>
      <LoginInner />
    </Suspense>
  );
}
