import Link from "next/link";
import type { ReactNode } from "react";
import { AuthWave } from "./auth-wave";
import "./auth.css";

// Shared frame for every auth page, so login/signup/reset/verify/confirm can never drift apart
// visually.
//
// The background artwork is app/auth/auth-wave.tsx — soft draped light in the corners, matching
// the supplied reference. It replaced the rotating cube here: a centred card has no side column to
// put the cube in, and cube-plus-wave in the same corner just fought for attention. The cube is
// untouched on the public landing hero, which is where it still earns its place.
//
// Not a client component, and neither is the wave (it is static SVG), so the auth screens ship
// essentially no JavaScript for their chrome.
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

      {/* Ambient artwork layer, behind everything — the draped light from the reference. Lives
          outside the centred column so it can span the whole page; see .ix-auth__art. */}
      <div className="ix-auth__art" aria-hidden="true">
        <AuthWave />
      </div>

      <header className="ix-auth__bar">
        <Link href="/" className="ix-auth__bar-link">Home</Link>
      </header>

      <main id="ix-auth-main" className="ix-auth__body">
        <div className="ix-auth__col">
          {/* The brand mark sits at the top of the centred column. The wordmark text is present for
              the accessible name but visually collapsed — the heading below already names us. */}
          <Link href="/" className="ix-wordmark" aria-label="Improvexus home">
            <span className="ix-wordmark__mark" aria-hidden="true">I</span>
            Improvexus
          </Link>

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
