"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { AuthCube } from "./auth-cube";
import "./auth-cube.css";
import "./auth.css";

// Shared frame for every auth page (login/signup/reset/reset-confirm/verify) — kept as a single
// component so they never drift from each other visually. Visual language: black/charcoal
// background with soft grayscale lighting, a restrained-border floating card (no heavy box), and
// the decorative rotating cube from auth-cube.tsx — modeled on resend.com/login's composition
// (inspected directly), rebuilt from scratch with Improvexus's own mark, wordmark, and copy rather
// than any of Resend's actual assets or exact colors.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="ix-auth-page">
      <AuthCube />
      <div className="ix-auth-veil" aria-hidden="true" />
      <Link href="/" className="ix-auth-home"><ChevronLeft size={15} /> Home</Link>
      <div className="ix-auth-card">
        <div className="ix-auth-brand">
          <span className="ix-auth-mark" aria-hidden="true">I</span>
          <span className="ix-auth-wordmark">IMPROVEXUS</span>
        </div>
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
