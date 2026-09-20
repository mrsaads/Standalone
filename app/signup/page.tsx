"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, AuthField } from "@/app/auth/auth-shell";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [upworkLink, setUpworkLink] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, mobile, upworkLink, email, password }),
      });
      const result = await response.json() as { error?: string; needsVerification?: boolean };
      if (!response.ok) throw new Error(result.error || "Signup could not be completed.");
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Signup could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Check your email">
        <p className="ix-auth-subtitle">
          We sent a verification link to <strong>{email}</strong>. Confirm it to finish creating your account.
        </p>
        <Link href="/login" className="ix-auth-links-center">Back to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your Improvexus account"
      subtitle={<>Already have an account? <Link href="/login">Sign in</Link>.</>}
    >
      <form onSubmit={submit}>
        <AuthField label="Full name" htmlFor="ix-name">
          <Input id="ix-name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={120} autoComplete="name" />
        </AuthField>
        <AuthField label="Mobile number" htmlFor="ix-mobile">
          <Input id="ix-mobile" value={mobile} onChange={e => setMobile(e.target.value)} required maxLength={30} autoComplete="tel" placeholder="+92 3xx xxxxxxx" />
        </AuthField>
        <AuthField label="Upwork profile link" htmlFor="ix-upwork">
          <Input id="ix-upwork" value={upworkLink} onChange={e => setUpworkLink(e.target.value)} maxLength={300} placeholder="https://www.upwork.com/freelancers/…" />
        </AuthField>
        <AuthField label="Email" htmlFor="ix-email">
          <Input id="ix-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} autoComplete="email" placeholder="you@example.com" />
        </AuthField>
        <AuthField label="Password" htmlFor="ix-password">
          <Input id="ix-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={200} autoComplete="new-password" />
        </AuthField>
        {error && <p role="alert" className="ix-auth-error">{error}</p>}
        <Button type="submit" disabled={submitting} className="mt-2">
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
