"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthShell } from "@/app/auth/auth-shell";

// Why this page exists, instead of Supabase's email link going straight to
// `/auth/v1/verify` (the default `{{ .ConfirmationURL }}` template): a bare GET link is exactly
// what Gmail's and many corporate mail gateways' link-safety scanners pre-fetch to check for
// phishing/malware *before the person ever opens the email* — and Supabase's signup/recovery
// tokens are single-use, so that automated prefetch silently consumes the token. The person's own
// click then hits an already-used token and gets "Email link is invalid or has expired"
// (otp_expired) on the very first click, every time, for no fault of their own.
//
// The fix (Supabase's own documented workaround for this): the email template links here instead,
// passing `token_hash` + `type` as plain query params. This page does NOT verify anything on load
// — a scanner bot fetching this URL just renders an inert page and never touches the token. Only
// an actual click on the button below calls verifyOtp() and consumes it, which a bot's GET-only
// prefetch cannot trigger.
//
// Requires updating Supabase's email templates (dashboard: Authentication -> Email Templates) to
// link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (and `type=recovery`
// for the reset-password template) instead of the default `{{ .ConfirmationURL }}`. That's a
// dashboard-only change — nothing here takes effect until the templates point here.
function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = params.get("next") || "/";

  const [state, setState] = useState<"idle" | "verifying" | "error">("idle");
  const [error, setError] = useState("");

  if (!tokenHash || !type) {
    return (
      <AuthShell title="Invalid link">
        <p className="ix-auth-error" role="alert">
          This confirmation link is missing required information. Request a new one from the
          verify or reset-password page.
        </p>
      </AuthShell>
    );
  }

  async function confirm() {
    setState("verifying");
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
      if (verifyError) throw new Error(verifyError.message);
      router.replace(type === "recovery" ? "/reset-password/confirm" : next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This link is invalid or has expired.");
      setState("error");
    }
  }

  const title = type === "recovery" ? "Confirm password reset" : "Confirm your email";
  const subtitle =
    type === "recovery"
      ? "Click below to continue resetting your password."
      : "Click below to finish creating your Improvexus account.";

  return (
    <AuthShell title={title} subtitle={subtitle}>
      {error && <p role="alert" className="ix-auth-error">{error}</p>}
      <Button type="button" disabled={state === "verifying"} onClick={confirm} className="mt-2">
        {state === "verifying" ? "Confirming…" : "Confirm"}
      </Button>
    </AuthShell>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<AuthShell title="Loading…">{null}</AuthShell>}>
      <ConfirmInner />
    </Suspense>
  );
}
