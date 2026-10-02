import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { entitlementFor, entitlementLabel } from "@/lib/entitlements";
import { getAuditSummary, getShellNav } from "@/lib/shell-data";
import { AppShell, Def, Defs, PageHead, Panel, StatCard, Stats } from "../app-shell";

export const dynamic = "force-dynamic";

// Account: who you are, what each of the three permissions currently says about you, and how to
// change the ones that are changeable.
//
// The three are shown SEPARATELY and labelled as separate things, because conflating them is exactly
// the confusion this rebuild exists to remove. They were three prose tiles; they are now a stat
// strip — three labels, three values, three one-line explanations — because the question a person
// opens this page with is "what am I on", not "tell me about permissions".
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const entitlement = entitlementFor(user);
  const { nav, workspaces } = await getShellNav(user);
  const { auditsLast7Days, recent } = await getAuditSummary(user.id);

  return (
    <AppShell nav={nav} narrow>
      <PageHead
        title="Account"
        description="Your details, and what this account currently has access to."
      />

      <div style={{ marginBottom: "var(--ix-gap-lg)" }}>
        <Stats>
          <StatCard
            label="Account role"
            value={user.role === "admin" ? "Administrator" : "Standard"}
            note={user.role === "admin"
              ? "You can open the admin panel"
              : "Only Improvexus staff hold administrator accounts"}
          />
          <StatCard
            label="Audit plan"
            value={entitlementLabel(entitlement.plan)}
            note={entitlement.canDownload
              ? "PDF and Word export included"
              : "8 of 23 findings, no export"}
          />
          <StatCard
            label="Profile management"
            value={workspaces.length > 0 ? "Enrolled" : "Not enrolled"}
            note={workspaces.length > 0
              ? workspaces.map(w => w.name).join(", ")
              : "Arranged by an account manager, never bought"}
          />
        </Stats>
      </div>

      <Panel
        title="Your details"
        description="To change any of these, contact Improvexus. You can't edit them yourself here yet."
      >
        <Defs>
          <Def label="Name" value={user.fullName || <span className="ix-muted-inline">Not set</span>} />
          <Def label="Email" value={user.email} />
          <Def label="Mobile" value={user.mobile || <span className="ix-muted-inline">Not set</span>} />
          <Def label="Upwork profile" value={user.upworkLink || <span className="ix-muted-inline">Not set</span>} />
          <Def
            label="Password"
            value={<>
              Managed by your own sign-in and never visible to Improvexus.{" "}
              <Link href="/reset-password" className="ix-link">Change it</Link>.
            </>}
          />
        </Defs>
      </Panel>

      <Panel
        title="Your audit allowance"
        description="What you can do with the AI profile audit right now."
      >
        <Defs>
          <Def
            label="This 7-day period"
            value={entitlement.unlimited
              ? "Unlimited audits"
              : auditsLast7Days > 0
                ? "Used. It resets 7 days after your last completed audit"
                : "1 audit available"}
          />
          <Def
            label="Extra credits"
            value={entitlement.creditsRemaining > 0
              ? `${entitlement.creditsRemaining} remaining, granted by Improvexus`
              : "None granted"}
          />
          <Def
            label="Findings you can read"
            value={entitlement.canDownload
              ? "All 23 criteria, with evidence and recommended actions"
              : "8 of 23, one from each profile area. Your score is still calculated from all 23."}
          />
          <Def label="Action plan" value={entitlement.canDownload ? "Included" : "Not included on this plan"} />
          <Def label="Report export" value={entitlement.canDownload ? "PDF and Word" : "Not included on this plan"} />
          <Def label="AI optimization section" value={entitlement.canOptimize ? "Included" : "Not included on this plan"} />
          <Def label="Audits saved" value={`${recent.length} shown on your dashboard`} />
        </Defs>
      </Panel>

      <Panel
        title="How these three fit together"
        description="They are independent by design, and the product enforces that rather than just saying it."
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: "var(--ix-text)" }}>
          <li>Being a managed client does not change your audit plan.</li>
          <li>Paying for audits does not enrol you in profile management.</li>
          <li>
            A managed client reads and downloads their weekly reports with no audit plan at all, and
            is never asked to pay to read them.
          </li>
        </ul>
      </Panel>
    </AppShell>
  );
}
