"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";

// Reached after /auth/callback exchanges the emailed recovery code for a session. That route
// redirects here with a real (recovery) Supabase session already set in cookies, so this page's
// only job is to collect the new password and call updateUser — it does not re-parse any token
// itself. If someone lands here without a valid recovery session, updateUser simply fails and we
// show that as an error rather than guessing at the session state ourselves.
export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setError("This reset link is invalid or has expired. Request a new one.");
      }
      setReady(true);
    });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password could not be updated.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <AuthShell title="Checking your link…">{null}</AuthShell>;
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Redirecting you to sign in…">
        {null}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={submit}>
        <AuthField label="New password" htmlFor="ix-password">
          <Input id="ix-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={200} autoComplete="new-password" />
        </AuthField>
        <AuthField label="Confirm password" htmlFor="ix-confirm">
          <Input id="ix-confirm" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} maxLength={200} autoComplete="new-password" />
        </AuthField>
        {error && <p role="alert" className="ix-auth-error">{error}</p>}
        <Button type="submit" disabled={submitting} className="mt-2">{submitting ? "Updating…" : "Update password"}</Button>
      </form>
      <Link href="/login" className="ix-auth-links-center">Back to sign in</Link>
    </AuthShell>
  );
}
