"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import "./app-shell.css";

async function signOut() {
  try { await createSupabaseBrowserClient().auth.signOut(); }
  finally { window.location.href = "/login"; }
}

export type ShellNav = {
  email: string;
  isAdmin: boolean;
  // Whether to show the Client Portal item at all. Shown only to someone who actually has a
  // managed-client assignment (or to an admin), so nobody is given a navigation item that leads
  // exclusively to a locked door.
  showPortal: boolean;
  unreadNotifications: number;
};

// Top-level navigation. The item set is decided on the server from real membership and role, and
// passed in — this component never guesses at permissions, and an item it does not render is also
// an item whose route independently refuses the request (see lib/workspace-access.ts). Hiding a
// link is a usability decision here, never a security one.
export function AppShell({ nav, children }: { nav: ShellNav; children: ReactNode }) {
  const pathname = usePathname();

  const items: { href: string; label: string; badge?: number }[] = [
    { href: "/", label: "Home" },
    { href: "/audits", label: "Audits" },
  ];
  if (nav.showPortal) items.push({ href: "/portal", label: "Client portal" });
  items.push({ href: "/notifications", label: "Notifications", badge: nav.unreadNotifications });
  items.push({ href: "/account", label: "Account" });
  if (nav.isAdmin) items.push({ href: "/admin", label: "Admin" });

  // "/" must match exactly, or every route would light up as Home.
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="ix-shell">
      <a href="#ix-main" className="ix-skip-link">Skip to content</a>

      <header className="ix-shell__bar">
        <Link href="/" className="ix-wordmark ix-wordmark--sm" aria-label="Improvexus home">
          <span className="ix-wordmark__mark" aria-hidden="true" />
          Improvexus
        </Link>

        <nav className="ix-shell__nav" aria-label="Primary">
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="ix-shell__link"
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
              {item.badge ? (
                <span className="ix-shell__count" aria-label={`${item.badge} unread`}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="ix-shell__right">
          <span className="ix-shell__email" title={nav.email}>{nav.email}</span>
          <button type="button" className="ix-btn ix-btn--quiet" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main id="ix-main" className="ix-shell__main">
        <div className="ix-shell__col">{children}</div>
      </main>
    </div>
  );
}

export function PageHead({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ix-page-head">
      <div className="ix-page-head__row">
        <h1 className="ix-title ix-title--lg" tabIndex={-1}>{title}</h1>
        {actions}
      </div>
      {description && <p className="ix-subtitle" style={{ maxWidth: "62ch" }}>{description}</p>}
    </div>
  );
}
