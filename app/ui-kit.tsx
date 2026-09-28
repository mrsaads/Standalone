"use client";
import Link from "next/link";
import type { ReactNode } from "react";

// The handful of composition pieces both halves of the product are built from.
//
// They live in one file, not two, for the same reason their CSS lives in design-system.css rather
// than in admin.css and app-shell.css: the admin panel and the customer app had drifted into two
// visual languages, and a second copy of "Panel" is exactly how that happens again. The admin shell
// and the app shell both import from here.
//
// Nothing in this file knows anything about permissions or data. It is layout.

/** A section of a page: header, optional description and actions, body. */
export function Panel({
  title,
  description,
  actions,
  footer,
  flush,
  children,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Body padding off — for a panel whose body is a full-bleed table or list. */
  flush?: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="ix-panel" aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="ix-panel__head">
        <div style={{ minWidth: 0 }}>
          <h2 className="ix-panel__title" id={id ? `${id}-title` : undefined}>{title}</h2>
          {description && <p className="ix-panel__desc">{description}</p>}
        </div>
        {actions && <div className="ix-actions">{actions}</div>}
      </div>
      <div className={flush ? "ix-panel__body ix-panel__body--flush" : "ix-panel__body"}>{children}</div>
      {footer && <div className="ix-panel__foot">{footer}</div>}
    </section>
  );
}

/** Wraps a wide table so it scrolls within its panel rather than compressing its last column. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="ix-panel__scroll">{children}</div>;
}

/** A strip of headline figures. Give it StatCard children. */
export function Stats({ children }: { children: ReactNode }) {
  return <div className="ix-stats">{children}</div>;
}

export function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** "attention" is amber, "positive" is green. Neither is the accent — that reads as a link. */
  tone?: "attention" | "positive";
}) {
  // A word-length value gets a smaller size: 26px "Not enrolled" reads as shouting and wraps badly
  // in a narrow column, while 26px "412" is exactly right.
  const isWord = typeof value === "string" && !/^[\d.,%/\s-]+$/.test(value);
  return (
    <div className="ix-stat-card">
      <span className="ix-stat-card__label">{label}</span>
      <span className={isWord ? "ix-stat-card__value ix-stat-card__value--word" : "ix-stat-card__value"}>{value}</span>
      {note && (
        <span className={`ix-stat-card__note${tone ? ` ix-stat-card__note--${tone}` : ""}`}>{note}</span>
      )}
    </div>
  );
}

export type TileFact = { value: ReactNode; label: string };

/**
 * A tile: what this is, whether anything is waiting, and two or three numbers describing its state —
 * all without being clicked. `href` omitted renders the same block as a non-interactive card, for
 * something the person cannot open yet.
 */
export function Tile({
  href,
  icon,
  title,
  body,
  badge,
  badgeTone = "quiet",
  facts,
  action,
}: {
  href?: string;
  icon?: ReactNode;
  title: string;
  body: ReactNode;
  badge?: ReactNode;
  /** "attn" is the filled accent pill — the only accent-filled element on a page. */
  badgeTone?: "attn" | "quiet" | "locked";
  facts?: TileFact[];
  /** Shown instead of facts, for a tile whose point is a button rather than numbers. */
  action?: ReactNode;
}) {
  const inner = (
    <>
      {(icon || badge) && (
        <div className="ix-tile-link__top">
          {icon ? <span className="ix-tile-link__icon">{icon}</span> : <span />}
          {badge && (
            <span className={badgeTone === "attn" ? "ix-tile-link__attn" : `ix-tile-link__attn ix-tile-link__attn--${badgeTone}`}>
              {badge}
            </span>
          )}
        </div>
      )}
      <h2 className="ix-tile-link__title">{title}</h2>
      <p className="ix-tile-link__body">{body}</p>
      {action ? (
        <div className="ix-tile-link__facts">{action}</div>
      ) : facts && facts.length > 0 ? (
        <div className="ix-tile-link__facts">
          {facts.map(fact => (
            <div key={fact.label} className="ix-tile-link__fact">
              <span className="ix-tile-link__fact-value">{fact.value}</span>
              <span className="ix-tile-link__fact-label">{fact.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  if (!href) return <div className="ix-tile-link ix-tile-link--static">{inner}</div>;
  return <Link href={href} className="ix-tile-link">{inner}</Link>;
}

export function Tiles({ children }: { children: ReactNode }) {
  return <div className="ix-tiles">{children}</div>;
}
