"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import "./admin.css";

// The frame every admin page sits in: one sticky bar carrying the five areas, the signed-in admin,
// and the way back to the customer side of the product.
//
// The counts in the bar come from the server (see lib/admin-stats.ts) and are only rendered when
// something is actually waiting. That is deliberate: a badge that is always there is wallpaper, and
// a badge that appears only when there is work to do is a signal you can trust from the corner of
// your eye. It also means you can see "3 enquiries waiting" from inside the reports page without
// navigating back to the overview to check.
//
// This component renders navigation only. It never decides what an admin may do: every page behind
// these links re-authorizes on the server, and so does every API route those pages call. Hiding a
// link here would not protect anything, and showing one cannot grant anything.

export type AdminNavCounts = {
  enquiries: number;
  optimization: number;
  notifications: number;
  clients: number;
};

const AREAS: { href: string; label: string; count?: keyof AdminNavCounts }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/clients", label: "Client portals" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/enquiries", label: "Enquiries", count: "enquiries" },
  { href: "/admin/requests", label: "Optimization", count: "optimization" },
  { href: "/admin/accounts", label: "Audits & members" },
];

export function AdminShell({
  adminEmail,
  counts,
  title,
  description,
  actions,
  children,
}: {
  adminEmail: string;
  counts: AdminNavCounts;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // "/admin" has to match exactly or every area would light up as Overview.
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <div className="ix-admin">
      <a href="#ix-admin-main" className="ix-skip-link">Skip to content</a>

      <header className="ix-admin__bar">
        <Link href="/admin" className="ix-admin__brand" aria-label="Improvexus admin overview">
          Improvexus
          <span className="ix-admin__brand-tag">Admin</span>
        </Link>

        <nav className="ix-admin__nav" aria-label="Admin areas">
          {AREAS.map(area => {
            const waiting = area.count ? counts[area.count] : 0;
            return (
              <Link
                key={area.href}
                href={area.href}
                className="ix-admin__link"
                aria-current={isActive(area.href) ? "page" : undefined}
              >
                {area.label}
                {waiting > 0 && (
                  <span className="ix-admin__count" aria-label={`${waiting} waiting`}>
                    {waiting > 99 ? "99+" : waiting}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ix-admin__right">
          <span className="ix-admin__email" title={adminEmail}>{adminEmail}</span>
          <Link href="/" className="ix-btn ix-btn--quiet">Exit admin</Link>
        </div>
      </header>

      <main id="ix-admin-main" className="ix-admin__main">
        <div className="ix-admin__col">
          <div className="ix-admin__head">
            <div className="ix-admin__head-text">
              <h1 className="ix-title ix-title--lg" tabIndex={-1}>{title}</h1>
              {description && <p className="ix-subtitle" style={{ maxWidth: "80ch" }}>{description}</p>}
            </div>
            {actions && <div className="ix-admin__head-actions">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

// Panel and TableScroll live in app/ui-kit.tsx, shared with the customer app — one definition, so
// the admin panel and a client's report cannot drift into two visual languages again. Re-exported
// here because every admin page already imports them from this module.
export { Panel, TableScroll, Stats, StatCard, Tile, Tiles } from "../ui-kit";
