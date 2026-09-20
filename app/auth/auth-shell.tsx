"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import "./auth.css";

// Shared frame for every auth page. See auth.css for the design rationale. Kept as a single
// component so login/signup/reset/verify never drift from each other visually.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="ix-auth-page">
      <div className="ix-auth-glow" aria-hidden="true" />
      <Link href="/" className="ix-auth-home"><ChevronLeft size={16} /> Home</Link>
      <div className="ix-auth-card">
        <img src="/brand/improvexus-logo.png" alt="Improvexus" className="ix-auth-logo" />
        <div className="ix-auth-heading">
          <h1 className="ix-auth-title">{title}</h1>
          {subtitle && <p className="ix-auth-subtitle">{subtitle}</p>}
        </div>
        <div className="ix-auth-body">{children}</div>
        <p className="ix-auth-terms">
          By continuing, you agree to Improvexus&apos;s Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

export function AuthField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <label className="ix-auth-field" htmlFor={htmlFor}>
      {label}
      {children}
    </label>
  );
}
