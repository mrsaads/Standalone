import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, FileSearch, LineChart } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { entitlementFor, entitlementLabel } from "@/lib/entitlements";
import {
  getAuditSummary,
  getLatestPublishedReport,
  getOpenManagementEnquiry,
  getRecentNotifications,
  getShellNav,
} from "@/lib/shell-data";
import { AppShell, PageHead, Panel, StatCard, Stats, Tile, Tiles } from "./app-shell";
import type { Metadata } from "next";
import { LandingPage } from "./landing-page";
import { JsonLd } from "./marketing/json-ld";
import { faqSchema, organizationSchema, websiteSchema } from "@/lib/marketing/schema";
import { HOME_FAQS } from "@/lib/marketing/home-faqs";
import { HOME_DESCRIPTION, HOME_TITLE } from "@/lib/marketing/site";
import { RequestManagementButton } from "./request-management";

export const dynamic = "force-dynamic";

// What a search engine sees: "/" is the public landing page for anyone who is not signed in.
export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
};

// The dashboard: the first screen after sign-in.
//
// What changed, and why: this used to be two equal 260px cards side by side — "Profile audits" and
// "Managed client portal" — shown at the same weight to everybody. For the majority of accounts, who
// are not managed clients, half the screen was a large card whose entire message was "you do not
// have this." That is a poor trade for the most-visited page in the product.
//
// Now the facts come first as a strip of four figures, the two products are tiles sized to what they
// actually say, and the space below belongs to the things a person came here to act on: their recent
// audits, their latest weekly report, and anything unread.
//
// Still a server component. Entitlement and managed-client membership are resolved here, server-side,
// from the database — the browser is never asked what it is allowed to see, and the routes behind
// each link enforce the same rules independently.
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Audit-ready emails sent before the redesign link to "/?openAudit=<id>"; the report now lives
  // under /audits, so forward those links rather than dropping the reader on the dashboard.
  const { openAudit } = await searchParams;
  if (typeof openAudit === "string" && /^[0-9a-f-]{36}$/i.test(openAudit)) redirect(`/audits?openAudit=${openAudit}`);

  const user = await getCurrentUser();
  // Signed out: show the public marketing landing page. "/" is a public path in middleware.ts, so a
  // visitor genuinely reaches this branch rather than being bounced.
  if (!user) return (
    <>
      <JsonLd data={[organizationSchema(), websiteSchema(), faqSchema(HOME_FAQS)]} />
      <LandingPage />
    </>
  );

  const entitlement = entitlementFor(user);
  const { nav, workspaces } = await getShellNav(user);
  const [{ recent, auditsLast7Days }, latestReport, notifications, enquiry] = await Promise.all([
    getAuditSummary(user.id),
    getLatestPublishedReport(workspaces.map(w => w.id)),
    getRecentNotifications(user.id, 3),
    workspaces.length === 0 ? getOpenManagementEnquiry(user.id) : Promise.resolve(null),
  ]);

  const weeklyAllowanceUsed = entitlement.unlimited ? false : auditsLast7Days > 0;
  const canStartAudit = entitlement.unlimited || !weeklyAllowanceUsed || entitlement.creditsRemaining > 0;
  // Straight from the shell's own count, so the header badge and this tile can never disagree —
  // they used to, because the tile counted only the unread ones among the newest three.
  const unread = nav.unreadNotifications;
  const firstName = user.fullName ? user.fullName.split(" ")[0] : "";

  return (
    <AppShell nav={nav}>
      <PageHead
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        description="Two separate things live here. An AI audit scores your own Upwork profile against a fixed 23-point rubric. A weekly report is what the Improvexus team sends you if we manage your profile for you."
      />

      <Stats>
        <StatCard
          label="Audit plan"
          value={entitlementLabel(entitlement.plan)}
          note={entitlement.canDownload ? "All 23 findings · PDF and Word export" : "8 of 23 findings · no export"}
        />
        <StatCard
          label="This week"
          value={entitlement.unlimited ? "Unlimited" : weeklyAllowanceUsed ? "Used" : "1 available"}
          note={
            entitlement.unlimited ? "No weekly limit on your account"
              : weeklyAllowanceUsed ? "Resets 7 days after your last audit"
              : "One audit per rolling 7 days"
          }
          tone={!entitlement.unlimited && weeklyAllowanceUsed && entitlement.creditsRemaining === 0 ? "attention" : undefined}
        />
        <StatCard
          label="Extra credits"
          value={entitlement.creditsRemaining}
          note={entitlement.creditsRemaining > 0 ? "Granted by Improvexus" : "None granted"}
          tone={entitlement.creditsRemaining > 0 ? "positive" : undefined}
        />
        <StatCard
          label="Saved audits"
          value={recent.length}
          note={recent.length === 0 ? "Nothing saved yet" : "Available to reopen any time"}
        />
      </Stats>

      <div style={{ marginTop: "var(--ix-gap-xl)" }}>
        <Tiles>
          <Tile
            href="/audits"
            icon={<FileSearch size={20} aria-hidden="true" />}
            title="Profile audits"
            body="Score your Upwork profile against the 23-point rubric and see, with evidence, what to fix first."
            badge={canStartAudit ? "Ready" : "Allowance used"}
            badgeTone={canStartAudit ? "quiet" : "locked"}
            action={<span className="ix-btn ix-btn--secondary">{canStartAudit ? "Start an audit" : "View saved audits"}</span>}
          />

          {/* The portal tile is only a link when there is something behind it. For the majority of
              accounts it states the position in one line and offers the one action that exists —
              rather than occupying half the dashboard to say "no". */}
          {workspaces.length > 0 ? (
            <Tile
              href="/portal"
              icon={<LineChart size={20} aria-hidden="true" />}
              title="Client portal"
              body={`Weekly reports from the Improvexus team for ${workspaces.map(w => w.name).join(", ")}.`}
              badge="Enrolled"
              badgeTone="quiet"
              facts={[
                { value: workspaces.length, label: workspaces.length === 1 ? "Client" : "Clients" },
                { value: latestReport ? latestReport.periodEnd : "—", label: "Latest report" },
              ]}
            />
          ) : (
            <Tile
              icon={<LineChart size={20} aria-hidden="true" />}
              title="Client portal"
              body={
                enquiry
                  ? `We have your request from ${new Date(enquiry.createdAt).toLocaleDateString()}. Access is set up by hand, so nothing changes here until an account manager enrols you.`
                  : "Weekly reports, if the Improvexus team manages your profile for you. Enrolment is arranged by an account manager — there is no checkout."
              }
              badge="Not enrolled"
              badgeTone="locked"
              action={<RequestManagementButton alreadyRequested={Boolean(enquiry)} />}
            />
          )}

          {/* Shown only when there is something unread. A tile that is always there saying "0" is
              wallpaper; one that appears when it matters is a signal. */}
          {unread > 0 && (
            <Tile
              href="/notifications"
              icon={<Bell size={20} aria-hidden="true" />}
              title="Unread"
              body={notifications.find(n => !n.readAt)?.title ?? "You have unread notifications."}
              badge={`${unread} new`}
              badgeTone="attn"
              action={<span className="ix-btn ix-btn--secondary">Open notifications</span>}
            />
          )}
        </Tiles>
      </div>

      <div style={{ marginTop: "var(--ix-gap-xl)" }}>
        {/* A managed client's newest report, hoisted out of the portal so it is one click from the
            first screen they see. Only rendered when one actually exists. */}
        {latestReport && (
          <Panel
            title="Your latest weekly report"
            description={`${latestReport.profileName} · ${latestReport.periodStart} → ${latestReport.periodEnd}${latestReport.publishedAt ? ` · published ${new Date(latestReport.publishedAt).toLocaleDateString()}` : ""}`}
            actions={<Link href="/portal" className="ix-btn ix-btn--quiet">All reports</Link>}
          >
            <div className="ix-stack">
              <p className="ix-title" style={{ fontSize: 18 }}>
                {latestReport.title || `Week of ${latestReport.periodStart}`}
              </p>
              {latestReport.overview && <p className="ix-prose ix-prose--clamp">{latestReport.overview}</p>}
              {latestReport.clientActions && (
                <div className="ix-notice ix-notice--warning">
                  <div>
                    <strong>Needs your input</strong>
                    <p className="ix-prose" style={{ marginTop: 6 }}>{latestReport.clientActions}</p>
                  </div>
                </div>
              )}
              <div>
                <Link href={`/portal/reports/${latestReport.id}`} className="ix-btn ix-btn--primary">Open report</Link>
              </div>
            </div>
          </Panel>
        )}

        <Panel
          title="Saved audits"
          description="Every audit you have run. Nothing here is shared with anyone else."
          actions={recent.length > 0 ? <Link href="/audits" className="ix-btn ix-btn--quiet">Run another</Link> : undefined}
          flush={recent.length > 0}
        >
          {recent.length === 0 ? (
            <div className="ix-stack">
              <p className="ix-none">
                You have not run an audit yet. The first one takes a couple of minutes and needs
                nothing but your profile text — no Upwork password, ever.
              </p>
              <div><Link href="/audits" className="ix-btn ix-btn--primary">Start your first audit</Link></div>
            </div>
          ) : (
            <div className="ix-list">
              {recent.map(audit => {
                const assessed = audit.passCount + audit.weakCount + audit.failCount;
                return (
                  <Link key={audit.id} href={`/audits?openAudit=${audit.id}`} className="ix-list__item">
                    <div className="ix-list__main">
                      <span className="ix-list__title">{audit.profileName || "Untitled profile"}</span>
                      <span className="ix-list__sub">
                        {new Date(audit.createdAt).toLocaleDateString()} · {audit.passCount} pass ·{" "}
                        {audit.weakCount} needs work · {audit.failCount} fail
                      </span>
                    </div>
                    {/* "N/A" rather than 0.0 when nothing could be assessed: an audit that scored
                        nothing did not score zero, and showing 0.0 would invent a result. */}
                    <span className="ix-badge">{assessed ? audit.score.toFixed(1) : "N/A"}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        {nav.isAdmin && (
          <Panel
            title="Administration"
            description="You are signed in as an administrator. Enquiries, client portals, notifications, accounts and audits are all in the admin panel."
            actions={<Link href="/admin" className="ix-btn ix-btn--secondary">Open admin panel</Link>}
          >
            <p className="ix-none">
              Your own account is a normal account everywhere else in the product — being an
              administrator does not enrol you as a managed client.
            </p>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
