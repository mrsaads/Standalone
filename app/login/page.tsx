"use client";
import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";
import { useLockCountdown } from "@/app/auth/email-quota";
import { isDestination } from "@/lib/destination-shared";

// The path a signed-in visitor lands on after THIS login. When a workspace card sent them here
// (?destination=audit|client_portal), that explicit choice always wins for this one visit — it
// never overwrites their stored preferred_destination (only signup sets that; see
// app/api/auth/signup/route.ts). A plain "/log in" with no destination just goes to "/", where the
// server-side resolver (lib/destination.ts) applies the stored preference / assigned-client
// default. Admins always land on /admin regardless — that redirect happens server-side there and
// on "/" itself, not here, so this never needs to know who's an admin.
function destinationHref(destination: string | null): string {
  return isDestination(destination) ? (destination === "client_portal" ? "/client-portal" : "/audit") : "/";
}

function LoginInner() {
  const params = useSearchParams();
  const destination = params.get("destination");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(() => {
    const reason = params.get("reason");
    if (reason === "idle") return "You were signed out after a period of inactivity. Please sign in again.";
    if (reason === "expired") return "Your session has expired. Please sign in again.";
    return "";
  });
  const lock = useLockCountdown();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (lock.locked) return;
    setSubmitting(true);
    try {
      // Signed in on the server (sets the session cookies there) so repeated wrong passwords can
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
      // navigation has been observed to silently no-op right after an auth cookie changes
      // out from under it (the push resolves, the cookie is set, but the route never
      // re-renders) — a full navigation always picks up the fresh session server-side.
      window.location.href = destinationHref(destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const signupHref = destination ? `/signup?destination=${destination}` : "/signup";

  return (
    <AuthShell
      title="Log in to Improvexus"
      subtitle={<>Don&apos;t have an account? <Link href={signupHref}>Sign up</Link>.</>}
    >
      <form onSubmit={submit}>
        <AuthField label="Email" htmlFor="ix-email">
          <Input id="ix-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} autoComplete="email" placeholder="you@example.com" />
        </AuthField>
        <AuthField label="Password" htmlFor="ix-password">
          <Input id="ix-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </AuthField>
        {error && <p role="alert" className="ix-auth-error">{error}</p>}
        <Button type="submit" disabled={submitting || lock.locked} className="mt-2">
          {submitting ? "Logging in…" : lock.locked ? `Try again in ${lock.clock}` : "Log In"}
        </Button>
      </form>
      <p className="ix-auth-links">
        <Link href="/reset-password">Forgot password?</Link>
        <Link href="/verify">Resend verification</Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell title="Log in to Improvexus">{null}</AuthShell>}>
      <LoginInner />
    </Suspense>
  );
}
