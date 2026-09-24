import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { entitlementFor, entitlementLabel } from "@/lib/entitlements";
import { getAuditSummary, getShellNav } from "@/lib/shell-data";
import { AppShell, PageHead } from "../app-shell";

export const dynamic = "force-dynamic";

// Account: who you are, what each of the three permissions currently says about you, and how to
// change the ones that are changeable. The three are shown SEPARATELY and labelled as separate
// things, because conflating them is exactly the confusion this rebuild exists to remove.
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const entitlement = entitlementFor(user);
  const { nav, workspaces } = await getShellNav(user);
  const { auditsLast7Days } = await getAuditSummary(user.id);

  return (
    <AppShell nav={nav}>
      <PageHead title="Account" description="Your details and what your account currently has access to." />

      <div className="ix-stack ix-stack--lg">
        <section className="ix-card ix-stack" aria-labelledby="ix-details">
          <h2 id="ix-details" className="ix-section-title">Your details</h2>
          <Detail label="Name" value={user.fullName || "Not set"} />
          <Detail label="Email" value={user.email} />
          <Detail label="Mobile" value={user.mobile || "Not set"} />
          <Detail label="Upwork profile" value={user.upworkLink || "Not set"} />
          <p className="ix-field-help">
            Your password is managed by your own sign-in and is never visible to Improvexus.
            {" "}<Link href="/reset-password" className="ix-link">Change your password</Link>.
          </p>
        </section>

        <section className="ix-stack" aria-labelledby="ix-access">
          <h2 id="ix-access" className="ix-section-title">What your account has access to</h2>
          <div className="ix-grid-3">
            <div className="ix-tile ix-stat">
              <span className="ix-stat__label">Account role</span>
              <span className="ix-stat__value">{user.role === "admin" ? "Administrator" : "Standard user"}</span>
              <span className="ix-stat__note">
                {user.role === "admin"
                  ? "You can open the admin panel and manage clients."
                  : "Normal access. Only Improvexus staff hold administrator accounts."}
              </span>
            </div>

            <div className="ix-tile ix-stat">
              <span className="ix-stat__label">Audit entitlement</span>
              <span className="ix-stat__value">{entitlementLabel(entitlement.plan)}</span>
              <span className="ix-stat__note">
                {entitlement.unlimited
                  ? "Unlimited audits."
                  : `${auditsLast7Days > 0 ? "Weekly audit used" : "1 audit available"} this 7-day period.`}
                {entitlement.creditsRemaining > 0 && ` ${entitlement.creditsRemaining} extra credit${entitlement.creditsRemaining === 1 ? "" : "s"}.`}
                {entitlement.canDownload ? " PDF and Word export included." : " Preview only — no PDF or Word export."}
              </span>
            </div>

            <div className="ix-tile ix-stat">
              <span className="ix-stat__label">Profile management</span>
              <span className="ix-stat__value">
                {workspaces.length > 0 ? "Enrolled" : "Not enrolled"}
              </span>
              <span className="ix-stat__note">
                {workspaces.length > 0
                  ? `${workspaces.map(w => w.name).join(", ")}. Assigned by Improvexus — separate from your audit entitlement.`
                  : "Set up manually by an Improvexus account manager. It is not something you can buy."}
              </span>
            </div>
          </div>
          <p className="ix-field-help">
            These three are independent. Being a managed client does not change your audit
            entitlement, and paying for audits does not enrol you in profile management.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="ix-row" style={{ justifyContent: "space-between", gap: 12 }}>
      <span className="ix-muted-inline">{label}</span>
      <span style={{ fontSize: 14, overflowWrap: "anywhere", textAlign: "right" }}>{value}</span>
    </div>
  );
}
