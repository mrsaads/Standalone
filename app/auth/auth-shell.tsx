import Link from "next/link";
import type { ReactNode } from "react";
import { AuthCube } from "./auth-cube";
import "./auth-cube.css";
import "./auth.css";

// Shared frame for every auth page, so login/signup/reset/verify/confirm can never drift apart
// visually.
//
// The rotating cube is back: it is the same component the public landing page uses in its hero
// (app/auth/auth-cube.tsx), which is what makes arriving at /login from the landing page feel like
// one product rather than two. It is purely decorative — aria-hidden, pointer-events: none, sitting
// behind the form's stacking context, and it hides itself entirely below 900px and freezes under
// prefers-reduced-motion.
//
// Not a client component: the shell itself needs no interactivity (AuthCube brings its own "use
// client"), so the auth screens still ship almost no JavaScript for the chrome.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="ix-auth">
      <a href="#ix-auth-main" className="ix-skip-link">Skip to content</a>

      <header className="ix-auth__bar">
        <Link href="/" className="ix-wordmark" aria-label="Improvexus home">
          <span className="ix-wordmark__mark" aria-hidden="true">I</span>
          Improvexus
        </Link>
        <Link href="/" className="ix-auth__bar-link">Back to site</Link>
      </header>

      <main id="ix-auth-main" className="ix-auth__body">
        <div className="ix-auth__col">
          <div className="ix-auth__heading">
            {/* tabIndex -1 so the skip link lands somewhere meaningful rather than on the container. */}
            <h1 className="ix-title" tabIndex={-1}>{title}</h1>
            {subtitle && <p className="ix-subtitle">{subtitle}</p>}
          </div>
          {children}
          {footer ?? (
            <p className="ix-auth__terms">
              By continuing you agree to Improvexus&apos;s Terms and Privacy Policy.
            </p>
          )}
        </div>

        {/* Decorative column. Empty by design — AuthCube positions itself against .ix-auth. */}
        <div className="ix-auth__art" aria-hidden="true">
          <AuthCube />
        </div>
      </main>
    </div>
  );
}

// A labelled field. `htmlFor` is required rather than optional so a field can never ship without
// its label wired to its control — the commonest way a form quietly stops being usable by keyboard
// and screen reader.
export function AuthField({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ix-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {help && <p className="ix-field-help">{help}</p>}
    </div>
  );
}
