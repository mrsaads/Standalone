"use client";
import { useCallback, useEffect, useState } from "react";

export type Quota = { limit: number; used: number; remaining: number; lockedUntil: string | null; retryAfterSeconds: number };

type ApiBody = { error?: string; code?: string; quota?: Quota | null; lockedUntil?: string; retryAfterSeconds?: number };

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Tracks this browser's auth-email allowance (server is the source of truth — this only mirrors
 * it) and runs the live lock countdown. When the countdown reaches zero it re-asks the server,
 * which confirms the lock is over and the browser is back to its full allowance.
 */
export function useEmailQuota() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((q: Quota | null | undefined, retryAfterSeconds?: number) => {
    if (q) setQuota(q);
    const retry = retryAfterSeconds ?? q?.retryAfterSeconds ?? 0;
    if (retry > 0) {
      // Countdown from the server's "seconds remaining", not its timestamp, so a wrong clock on
      // this device can't make the timer lie.
      setNow(Date.now());
      setLockedUntil(Date.now() + retry * 1000);
    } else if (q && !q.lockedUntil) {
      setLockedUntil(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/email-quota", { cache: "no-store" });
      if (res.ok) apply(await res.json() as Quota);
    } catch { /* display only */ }
  }, [apply]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!lockedUntil) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) {
        clearInterval(timer);
        setLockedUntil(null);
        void refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil, refresh]);

  /** Feed every auth-email API response through this so the counter/countdown stay in sync. */
  const fromResponse = useCallback((body: ApiBody) => {
    if (body.code === "EMAIL_LIMIT") apply(body.quota ?? null, body.retryAfterSeconds);
    else if (body.quota) apply(body.quota);
  }, [apply]);

  const secondsLeft = lockedUntil ? Math.max(0, (lockedUntil - now) / 1000) : 0;
  return { quota, locked: secondsLeft > 0, secondsLeft, clock: formatClock(secondsLeft), fromResponse, refresh };
}

export function EmailQuotaNotice({ state }: { state: ReturnType<typeof useEmailQuota> }) {
  const { quota, locked, clock } = state;
  if (locked) {
    return (
      <div className="ix-auth-quota ix-auth-quota-locked" role="status" aria-live="polite">
        <strong>Email limit reached on this browser</strong>
        <span>
          For your privacy and security, each browser can request {quota?.limit ?? 10} emails. You can
          sign up or request a new email again in
        </span>
        <span className="ix-auth-quota-clock" aria-label={`${clock} remaining`}>{clock}</span>
      </div>
    );
  }
  if (!quota) return null;
  if (quota.remaining > 3) return null; // stay quiet until it matters
  return (
    <p className="ix-auth-quota" role="status">
      {quota.remaining} of {quota.limit} emails left on this browser.
    </p>
  );
}

/** Small countdown for login lockouts (different rule, same display). */
export function useLockCountdown() {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) { clearInterval(timer); setUntil(null); }
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  const secondsLeft = until ? Math.max(0, (until - now) / 1000) : 0;
  return { locked: secondsLeft > 0, clock: formatClock(secondsLeft), lockFor: (seconds: number) => { setNow(Date.now()); setUntil(Date.now() + seconds * 1000); } };
}
