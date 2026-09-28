"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Panel, TableScroll } from "../admin-shell";

// Accounts, their audit plan and credits, and every audit the product has generated.
//
// This is the "memberships" half of the admin panel: an account's plan is a membership in the audit
// product, and it is entered by hand because no payment provider is connected. It is deliberately
// NOT the same thing as managed-client access, which lives in Client portals and is granted per
// workspace — the two are separate axes and conflating them in one screen is how they start
// leaking into each other.

export type UserRow = {
  id: string; email: string; fullName: string; mobile: string; upworkLink: string; role: string;
  auditEntitlement: string; auditCredits: number; auditCreditsUsed: number;
  planUpdatedAt: string; createdAt: string; lastSeenAt: string; auditCount: number;
  emailVerified: boolean; lastSignInAt: string | null;
};
export type AuditRow = {
  id: string; userEmail: string; profileName: string; score: number;
  passCount: number; weakCount: number; failCount: number;
  provider: string; billable: boolean; status: string; createdAt: string;
};
type DriveStatus = { connected: boolean; googleEmail?: string; connectedAt?: string; expired?: boolean; error?: string };
type PaymentRecord = {
  id: string; recordedByEmail: string; plan: string; amount: number;
  currency: string; method: string; reference: string; note: string; createdAt: string;
};

const driveMessages: Record<string, { title: string; tone: "default" | "destructive" }> = {
  connected: { title: "Google Drive connected.", tone: "default" },
  denied: { title: "Google access was not granted.", tone: "destructive" },
  invalid_state: { title: "The connection attempt expired or was invalid. Try connecting again.", tone: "destructive" },
  failed: { title: "The Google Drive connection failed. Check the OAuth credentials and try again.", tone: "destructive" },
  forbidden: { title: "Admin access is required to connect Google Drive.", tone: "destructive" },
};

const paymentMethods = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "easypaisa", label: "EasyPaisa / JazzCash" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export function AccountsAdmin({ users: initialUsers, audits }: { users: UserRow[]; audits: AuditRow[] }) {
  const params = useSearchParams();
  const driveParam = params.get("drive");
  const [users, setUsers] = useState(initialUsers);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [loadingDrive, setLoadingDrive] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Filters. Client-side over an already-loaded page of rows: with a couple of hundred accounts
  // this is instant and needs no round trip. If this ever grows past what one page should hold, the
  // right fix is server-side paging, not a bigger limit.
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  const visibleUsers = users.filter(u => {
    if (planFilter !== "all" && u.auditEntitlement !== planFilter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return u.email.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q) || u.mobile.includes(q);
  });

  // ------------------------------------------------------------------- manual plan / payments
  const [planUser, setPlanUser] = useState<UserRow | null>(null);
  const [planRecords, setPlanRecords] = useState<PaymentRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [planForm, setPlanForm] = useState({ auditEntitlement: "free", auditCredits: "0", amount: "", currency: "PKR", method: "bank_transfer", reference: "", note: "" });
  const [savingPlan, setSavingPlan] = useState(false);

  function openPlanDialog(row: UserRow) {
    setPlanUser(row);
    setPlanForm({ auditEntitlement: row.auditEntitlement, auditCredits: String(row.auditCredits ?? 0), amount: "", currency: "PKR", method: "bank_transfer", reference: "", note: "" });
    setLoadingRecords(true);
    fetch(`/api/admin/users/${row.id}/plan`, { cache: "no-store" })
      .then(r => r.json()).then((value: { records?: PaymentRecord[] }) => setPlanRecords(value.records || []))
      .catch(() => setPlanRecords([]))
      .finally(() => setLoadingRecords(false));
  }

  async function savePlan() {
    if (!planUser) return;
    setSavingPlan(true);
    try {
      const response = await fetch(`/api/admin/users/${planUser.id}/plan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditEntitlement: planForm.auditEntitlement,
          auditCredits: Number(planForm.auditCredits) || 0,
          amount: Number(planForm.amount) || 0,
          currency: planForm.currency, method: planForm.method,
          reference: planForm.reference, note: planForm.note,
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "The plan could not be saved.");
      setUsers(rows => rows.map(u => u.id === planUser.id
        ? { ...u, auditEntitlement: planForm.auditEntitlement, auditCredits: Number(planForm.auditCredits) || 0, planUpdatedAt: new Date().toISOString() }
        : u));
      toast.success(`${planUser.email}: audit entitlement set to ${planForm.auditEntitlement}, ${Number(planForm.auditCredits) || 0} credits.`);
      setPlanUser(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The plan could not be saved.");
    } finally { setSavingPlan(false); }
  }

  // ------------------------------------------------------------------------------ Drive status
  const refreshDrive = async () => {
    setLoadingDrive(true);
    try { const response = await fetch("/api/admin/drive/status", { cache: "no-store" }); setDrive(await response.json()); }
    catch { setDrive({ connected: false, error: "Drive status could not be loaded." }); }
    finally { setLoadingDrive(false); }
  };
  useEffect(() => { void refreshDrive(); }, []);

  // Delivery is a persisted queue processed by a background worker (lib/delivery-worker.ts), not
  // something this request performs inline — so this confirms the retry was QUEUED, not that it
  // finished. The per-audit status in the table reflects the real outcome once the worker runs.
  async function retryDelivery(auditId: string) {
    setRetrying(auditId);
    try {
      const response = await fetch(`/api/audits/${auditId}/deliver`, { method: "POST" });
      const result = await response.json() as { queued?: boolean; error?: string };
      if (!response.ok || !result.queued) throw new Error(result.error || "Retry could not be queued.");
      toast.success("Retry queued — Drive filing and the email will be re-attempted within a few seconds.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The retry could not be queued.");
    } finally { setRetrying(null); }
  }

  return (
    <>
      {driveParam && driveMessages[driveParam] && (
        <Alert variant={driveMessages[driveParam].tone} className="mb-6">
          <AlertTitle>{driveMessages[driveParam].title}</AlertTitle>
        </Alert>
      )}

      <Panel
        title="Google Drive filing"
        description="Owner-only connection. Every generated audit is filed under a user / profile / audit folder structure once connected."
        actions={
          // Deliberately an .ix-btn anchor rather than <Button asChild><a>: globals.css has an
          // unlayered `a{color:inherit}`, and unlayered rules beat Tailwind v4's layered utilities
          // regardless of specificity — so the anchor ignored the button's text colour and rendered
          // white-on-white. The .ix-btn classes are unlayered, so they apply correctly.
          <a href="/api/admin/drive/connect" className="ix-btn ix-btn--secondary">
            {drive?.connected ? "Reconnect" : "Connect Google Drive"}
          </a>
        }
      >
        {loadingDrive ? (
          <p className="ix-none">Checking connection…</p>
        ) : drive?.connected ? (
          <p className="text-sm">Connected as <strong>{drive.googleEmail}</strong>.</p>
        ) : (
          <p className="ix-none">
            {drive?.expired ? `The connection to ${drive.googleEmail} expired or was revoked.` : "Not connected yet."}
          </p>
        )}
      </Panel>

      <Panel
        title="Plans and payments"
        description="No payment provider is connected. Plan changes are entered by hand from whatever you were told — bank transfer, EasyPaisa, cash — and never a real card or account number."
      >
        <Alert>
          <AlertTitle>Manual plan management only</AlertTitle>
          <AlertDescription>
            A free account sees 8 of the 23 criteria — one from each profile area — plus its real score and
            the name of its biggest flaw. The other 15 findings, the action plan, the narrative and the AI
            Optimization section are withheld by the server, not hidden in the UI, and PDF/Word export is
            refused outright. Use &quot;Manage plan&quot; on an account below to switch it to Subscriber and record
            what you were paid. Every change is written to the admin audit log.
          </AlertDescription>
        </Alert>
      </Panel>

      <Panel
        title={<>Accounts <span className="ix-muted-inline">({visibleUsers.length}{visibleUsers.length !== users.length ? ` of ${users.length}` : ""})</span></>}
        description="Every registered account, its audit plan, and how many audits it has run."
        actions={
          <>
            <Input
              className="h-9 w-[220px]"
              placeholder="Search email, name, mobile"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search accounts"
            />
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-9 w-[180px]" aria-label="Filter by plan"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="subscribed">Subscribed</SelectItem>
                <SelectItem value="admin_granted">Granted by Improvexus</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        footer="Login credentials are never shown here — password resets go through the normal “forgot password” flow on the login page."
        flush
      >
        {visibleUsers.length === 0 ? (
          <p className="ix-none" style={{ padding: 20 }}>No account matches that search.</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Mobile</TableHead>
                  <TableHead>Role</TableHead><TableHead>Plan</TableHead><TableHead>Verified</TableHead>
                  <TableHead>Last sign-in</TableHead><TableHead>Audits</TableHead><TableHead>Joined</TableHead>
                  <TableHead>Subscription</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.fullName || "—"}</TableCell>
                    <TableCell>{u.mobile || "—"}</TableCell>
                    <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={u.auditEntitlement === "free" ? "secondary" : "default"}>{u.auditEntitlement}</Badge>
                      {u.auditCredits > 0 && <span className="ix-muted-inline"> +{Math.max(0, u.auditCredits - u.auditCreditsUsed)} credits</span>}
                    </TableCell>
                    <TableCell>{u.emailVerified ? <Badge variant="default">verified</Badge> : <Badge variant="secondary">unverified</Badge>}</TableCell>
                    <TableCell className="text-xs">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}</TableCell>
                    <TableCell>{u.auditCount}</TableCell>
                    <TableCell className="text-xs">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => openPlanDialog(u)}>Manage plan</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </Panel>

      <Panel
        title={<>Audits <span className="ix-muted-inline">({audits.length})</span></>}
        description="The 100 most recent audits. “Reserved” means the AI call is still in flight, or the server died before it could complete — the reaper in the delivery worker sweeps an old reservation to failed automatically."
        flush
      >
        {audits.length === 0 ? (
          <p className="ix-none" style={{ padding: 20 }}>No audits have been generated yet.</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead><TableHead>Profile</TableHead><TableHead>Score</TableHead>
                  <TableHead>Provider</TableHead><TableHead>Billable</TableHead><TableHead>Status</TableHead>
                  <TableHead>Generated</TableHead><TableHead>Retry filing / email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>{a.userEmail}</TableCell>
                    <TableCell>{a.profileName || "—"}</TableCell>
                    {/* "N/A" rather than 0.0 when no rubric item was scored: an audit that produced
                        nothing did not score zero, and showing 0.0 would be inventing a result. */}
                    <TableCell>{a.passCount + a.weakCount + a.failCount ? a.score.toFixed(1) : "N/A"}</TableCell>
                    <TableCell>{a.provider || "—"}</TableCell>
                    <TableCell><Badge variant={a.billable ? "default" : "secondary"}>{a.billable ? "yes" : "no"}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={a.status === "completed" ? "default" : a.status === "reserved" ? "outline" : "secondary"}>{a.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{new Date(a.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={retrying === a.id || a.status !== "completed"} onClick={() => void retryDelivery(a.id)}>
                        {retrying === a.id ? "Retrying…" : "Retry"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </Panel>

      <Dialog open={!!planUser} onOpenChange={open => !open && setPlanUser(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage plan — {planUser?.email}</DialogTitle>
            <DialogDescription>
              Manual entry only. No card or account number is ever stored — reference and note are whatever
              you were told (a transaction id, a receipt note).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Plan</label>
              <Select value={planForm.auditEntitlement} onValueChange={v => setPlanForm(f => ({ ...f, auditEntitlement: v }))}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free (8 of 23 findings, no export)</SelectItem>
                  <SelectItem value="subscribed">Subscribed (full access)</SelectItem>
                  <SelectItem value="admin_granted">Granted by Improvexus (full access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Extra credits</label>
                <Input className="mt-1" type="number" min="0" value={planForm.auditCredits}
                  onChange={e => setPlanForm(f => ({ ...f, auditCredits: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Amount</label>
                <Input className="mt-1" type="number" min="0" value={planForm.amount}
                  onChange={e => setPlanForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Currency</label>
                <Input className="mt-1" value={planForm.currency}
                  onChange={e => setPlanForm(f => ({ ...f, currency: e.target.value }))} placeholder="PKR" />
              </div>
              <div>
                <label className="text-sm font-medium">Method</label>
                <Select value={planForm.method} onValueChange={v => setPlanForm(f => ({ ...f, method: v }))}>
                  <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{paymentMethods.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Reference</label>
              <Input className="mt-1" value={planForm.reference}
                onChange={e => setPlanForm(f => ({ ...f, reference: e.target.value }))} placeholder="Transaction id / receipt note" />
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <Textarea className="mt-1" value={planForm.note}
                onChange={e => setPlanForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" />
            </div>
            <Button className="w-full" disabled={savingPlan} onClick={() => void savePlan()}>
              {savingPlan ? "Saving…" : "Save plan"}
            </Button>
            <div>
              <p className="ix-muted-inline mb-1 block">History</p>
              {loadingRecords ? <p className="ix-none text-xs">Loading…</p> : planRecords.length === 0 ? (
                <p className="ix-none text-xs">No records yet.</p>
              ) : (
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {planRecords.map(r => (
                    <li key={r.id} className="border-b pb-1">
                      {new Date(r.createdAt).toLocaleString()} · {r.plan} · {r.amount ? `${r.amount} ${r.currency}` : "—"}
                      {r.method && ` · ${r.method}`}{r.reference && ` · ${r.reference}`} · by {r.recordedByEmail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
