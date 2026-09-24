import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSearch, LineChart, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { entitlementFor, entitlementLabel } from "@/lib/entitlements";
import { getAuditSummary, getOpenManagementEnquiry, getShellNav } from "@/lib/shell-data";
import { AppShell, PageHead } from "./app-shell";
import { LandingPage } from "./landing-page";
import { RequestManagementButton } from "./request-management";

export const dynamic = "force-dynamic";

// The welcome dashboard: the first screen after sign-in, and the answer to "what is this product
// and what do I do here". Two large choices, each stating plainly what it is for, plus the status
// a person needs to understand what they are allowed to do before they click.
//
// A server component on purpose. Entitlement and managed-client membership are resolved here,
// server-side, from the database — the browser is never asked what it is allowed to see, and the
// routes behind each card enforce the same rules independently.
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Audit-ready emails sent before the redesign link to "/?openAudit=<id>"; the report now lives
  // under /audits, so forward those links rather than dropping the reader on the dashboard.
  const { openAudit } = await searchParams;
  if (typeof openAudit === "string" && /^[0-9a-f-]{36}$/i.test(openAudit)) redirect(`/audits?openAudit=${openAudit}`);

  const user = await getCurrentUser();
  // Signed out: show the public marketing landing page. "/" is a public path in middleware.ts, so
  // a visitor genuinely reaches this branch rather than being bounced — an earlier revision
  // redirected to /login here, which left the landing page built but unreachable and made the
  // product look like it had no front door at all.
  if (!user) return <LandingPage />;

  const entitlement = entitlementFor(user);
  const { nav, workspaces } = await getShellNav(user);
  const { recent, auditsLast7Days } = await getAuditSummary(user.id);
  const enquiry = workspaces.length === 0 ? await getOpenManagementEnquiry(user.id) : null;

  const weeklyAllowanceUsed = entitlement.unlimited ? false : auditsLast7Days > 0;
  const canStartAudit = entitlement.unlimited || !weeklyAllowanceUsed || entitlement.creditsRemaining > 0;

  return (
    <AppShell nav={nav}>
      <PageHead
        title={`Welcome${user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}`}
        description="Two things live here. An AI profile audit scores your own Upwork profile against a fixed 23-point rubric. A weekly management report is what the Improvexus team sends you if we manage your profile for you. They are separate products with separate access."
      />

      <div className="ix-grid-2">
        {/* ---------------------------------------------------------------- Profile audits */}
        <section className="ix-choice" aria-labelledby="ix-card-audits">
          <FileSearch className="ix-choice__icon" size={24} aria-hidden="true" />
          <h2 id="ix-card-audits" className="ix-choice__title">Profile audits</h2>
          <p className="ix-choice__body">
            Understand what is working and where your Upwork profile needs improvement.
          </p>

          <div className="ix-choice__meta">
            <span className="ix-badge ix-badge--accent">{entitlementLabel(entitlement.plan)}</span>
            {entitlement.unlimited ? (
              <span className="ix-badge">Unlimited audits</span>
            ) : (
              <span className="ix-badge">
                {weeklyAllowanceUsed ? "Weekly audit used" : "1 audit available this week"}
              </span>
            )}
            {entitlement.creditsRemaining > 0 && (
              <span className="ix-badge ix-badge--positive">
                {entitlement.creditsRemaining} extra {entitlement.creditsRemaining === 1 ? "credit" : "credits"}
              </span>
            )}
            <span className="ix-badge">{recent.length} saved</span>
          </div>

          {/* Locked state explains WHY and what to do about it, rather than just disabling. */}
          {!canStartAudit && (
            <p className="ix-field-help">
              Your free audit for this 7-day period has been used, and you have no extra credits.
              The allowance resets 7 days after your last completed audit. Improvexus can also grant
              extra audits — ask your account manager.
            </p>
          )}

          <div className="ix-choice__action">
            {canStartAudit ? (
              <Link href="/audits" className="ix-btn ix-btn--primary">Start an audit</Link>
            ) : (
              <Link href="/audits" className="ix-btn ix-btn--secondary">View saved audits</Link>
            )}
          </div>
        </section>

        {/* -------------------------------------------------------- Managed client portal */}
        <section className="ix-choice" aria-labelledby="ix-card-portal">
          <LineChart className="ix-choice__icon" size={24} aria-hidden="true" />
          <h2 id="ix-card-portal" className="ix-choice__title">Managed client portal</h2>
          <p className="ix-choice__body">
            View your weekly reports and updates from the Improvexus team.
          </p>

          {workspaces.length > 0 ? (
            <>
              <div className="ix-choice__meta">
                {workspaces.map(w => <span key={w.id} className="ix-badge ix-badge--positive">{w.name}</span>)}
              </div>
              <div className="ix-choice__action">
                <Link href="/portal" className="ix-btn ix-btn--primary">Open client portal</Link>
              </div>
            </>
          ) : (
            <>
              <div className="ix-choice__meta">
                <span className="ix-badge"><Lock size={12} aria-hidden="true" /> Not enrolled</span>
              </div>
              <p className="ix-choice__body">
                Available to clients enrolled in our profile management service.
              </p>
              {/* An enquiry is a lead, never a grant. The copy says so, and the API that records it
                  creates no membership — see app/api/management-enquiries/route.ts. */}
              {enquiry ? (
                <p className="ix-field-help">
                  We have your request from {new Date(enquiry.createdAt).toLocaleDateString()} and the
                  team will be in touch. Access is set up manually by Improvexus, so nothing changes
                  here until an account manager enrols you.
                </p>
              ) : null}
              <div className="ix-choice__action">
                <RequestManagementButton alreadyRequested={Boolean(enquiry)} />
              </div>
            </>
          )}
        </section>
      </div>

      {/* --------------------------------------------------------------------- Saved audits */}
      <section className="ix-stack" style={{ marginTop: "var(--ix-gap-xl)" }} aria-labelledby="ix-saved">
        <h2 id="ix-saved" className="ix-section-title">Saved audits</h2>
        {recent.length === 0 ? (
          <div className="ix-empty">
            <h3>No audits yet</h3>
            <p>
              Run your first audit to see how your Upwork profile scores against the 23-point rubric.
              Nothing is shared with anyone else.
            </p>
            <Link href="/audits" className="ix-btn ix-btn--secondary">Start an audit</Link>
          </div>
        ) : (
          <div className="ix-list">
            {recent.map(audit => (
              <Link key={audit.id} href={`/audits?openAudit=${audit.id}`} className="ix-list__item">
                <div className="ix-list__main">
                  <span className="ix-list__title">{audit.profileName || "Untitled profile"}</span>
                  <span className="ix-list__sub">
                    {new Date(audit.createdAt).toLocaleDateString()} · {audit.passCount} pass ·{" "}
                    {audit.weakCount} weak · {audit.failCount} fail
                  </span>
                </div>
                <span className="ix-badge">{audit.score.toFixed(1)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {nav.isAdmin && (
        <section className="ix-stack" style={{ marginTop: "var(--ix-gap-xl)" }} aria-labelledby="ix-admin-entry">
          <h2 id="ix-admin-entry" className="ix-section-title">Administration</h2>
          <div className="ix-notice">
            <div>
              You are signed in as an administrator. Manage client workspaces, audit entitlements,
              weekly reports and announcements from the admin panel.
              <div style={{ marginTop: 12 }}>
                <Link href="/admin" className="ix-btn ix-btn--secondary">Open admin panel</Link>
              </div>
            </div>
          </div>
        </section>
      )}
    </AppShell>
  );
}
