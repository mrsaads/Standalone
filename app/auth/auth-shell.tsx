import Link from "next/link";
import type { ReactNode } from "react";
import "./auth.css";

// Shared frame for every auth page, so login/signup/reset/verify/confirm can never drift apart
// visually. Not a client component: none of this needs interactivity, and keeping it on the server
// means the auth screens ship less JavaScript.
//
// The wordmark is text (see .ix-wordmark in app/design-system.css), not an image file — it stays
// sharp at any zoom, can be selected and read aloud, and carries no raster asset. There is no
// third-party branding anywhere on these screens.
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
          <span className="ix-wordmark__mark" aria-hidden="true" />
          Improvexus
        </Link>
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
