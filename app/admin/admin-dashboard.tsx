"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { AdminLeadRow, AdminManagementEnquiryRow } from "@/lib/admin-inbox-shared";
import type { AnnouncementListRow } from "@/lib/announcement-shared";
import { AdminInbox } from "./inbox-cards";
import { AnnouncementComposer } from "./announcement-composer";

type UserRow = {
  id: string; email: string; fullName: string; mobile: string; upworkLink: string; role: string;
  auditEntitlement: string; auditCredits: number; auditCreditsUsed: number; planUpdatedAt: string; createdAt: string; lastSeenAt: string; auditCount: number;
  emailVerified: boolean; lastSignInAt: string | null;
};
type AuditRow = { id: string; userEmail: string; profileName: string; score: number; passCount: number; weakCount: number; failCount: number; provider: string; billable: boolean; status: string; createdAt: string };
type DriveStatus = { connected: boolean; googleEmail?: string; connectedAt?: string; expired?: boolean; error?: string };
type PaymentRecord = { id: string; recordedByEmail: string; plan: string; amount: number; currency: string; method: string; reference: string; note: string; createdAt: string };
type OptimizationRequest = { id: string; userEmail: string; auditId: string | null; profileUrl: string; notes: string; status: string; createdAt: string };

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

export function AdminDashboard({
  adminEmail,
  users: initialUsers,
  audits,
  leads,
  managementEnquiries,
  announcements,
}: {
  adminEmail: string;
  users: UserRow[];
  audits: AuditRow[];
  leads: AdminLeadRow[];
  managementEnquiries: AdminManagementEnquiryRow[];
  announcements: AnnouncementListRow[];
}) {
  const params = useSearchParams();
  const driveParam = params.get("drive");
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [loadingDrive, setLoadingDrive] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [users, setUsers] = useState(initialUsers);

  // Optimization-request queue ("request optimization by a person") — the admin's worklist.
  const [optRequests, setOptRequests] = useState<OptimizationRequest[]>([]);
  const [loadingOpt, setLoadingOpt] = useState(true);
  const [updatingOpt, setUpdatingOpt] = useState<string | null>(null);
  const refreshOptRequests = async () => {
    setLoadingOpt(true);
    try { const response = await fetch("/api/admin/optimization-requests", { cache: "no-store" }); const value = await response.json() as { requests?: OptimizationRequest[] }; setOptRequests(value.requests || []); }
    catch { /* leave the last known list in place */ }
    finally { setLoadingOpt(false); }
  };
  useEffect(() => { void refreshOptRequests(); }, []);

  async function setOptStatus(id: string, status: string) {
    setUpdatingOpt(id);
    try {
      const response = await fetch(`/api/admin/optimization-requests/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "The status could not be updated.");
      setOptRequests(rows => rows.map(r => r.id === id ? { ...r, status } : r));
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "The status could not be updated."); }
    finally { setUpdatingOpt(null); }
  }

  // Manual plan / payment-record entry — the entire "subscription management" surface for this
  // build (no payment provider is connected; see the card below).
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
        body: JSON.stringify({ auditEntitlement: planForm.auditEntitlement, auditCredits: Number(planForm.auditCredits) || 0, amount: Number(planForm.amount) || 0, currency: planForm.currency, method: planForm.method, reference: planForm.reference, note: planForm.note }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "The plan could not be saved.");
      setUsers(rows => rows.map(u => u.id === planUser.id ? { ...u, auditEntitlement: planForm.auditEntitlement, auditCredits: Number(planForm.auditCredits) || 0, planUpdatedAt: new Date().toISOString() } : u));
      toast.success(`${planUser.email}: audit entitlement set to ${planForm.auditEntitlement}, ${Number(planForm.auditCredits) || 0} credits.`);
      setPlanUser(null);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "The plan could not be saved."); }
    finally { setSavingPlan(false); }
  }

  const refreshDrive = async () => {
    setLoadingDrive(true);
    try { const response = await fetch("/api/admin/drive/status", { cache: "no-store" }); setDrive(await response.json()); }
    catch { setDrive({ connected: false, error: "Drive status could not be loaded." }); }
    finally { setLoadingDrive(false); }
  };
  useEffect(() => { void refreshDrive(); }, []);

  // Delivery is now a persisted queue processed by a background worker (see
  // lib/delivery-worker.ts), not something this request performs inline — so this only confirms
  // the retry was queued, not that it finished. The worker picks it up within a few seconds; the
  // per-audit Drive/email status shown elsewhere in this table reflects the actual outcome once it
  // does.
  async function retryDelivery(auditId: string) {
    setRetrying(auditId);
    try {
      const response = await fetch(`/api/audits/${auditId}/deliver`, { method: "POST" });
      const result = await response.json() as { queued?: boolean; error?: string };
      if (!response.ok || !result.queued) throw new Error(result.error || "Retry could not be queued.");
      toast.success("Retry queued — Drive filing and the email will be re-attempted within a few seconds.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "The retry could not be queued."); }
    finally { setRetrying(null); }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Improvexus admin</h1>
          <p className="text-sm text-neutral-600">Signed in as {adminEmail} · unlimited audits</p>
        </div>
        <a href="/" className="text-sm underline">Back to workspace</a>
      </div>

      {driveParam && driveMessages[driveParam] && (
        <Alert variant={driveMessages[driveParam].tone} className="mb-6">
          <AlertTitle>{driveMessages[driveParam].title}</AlertTitle>
        </Alert>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Google Drive filing</CardTitle>
          <CardDescription>Owner-only connection. Every generated audit is filed under a user / profile / audit folder structure once connected.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          {loadingDrive ? (
            <p className="text-sm text-neutral-500">Checking connection…</p>
          ) : drive?.connected ? (
            <p className="text-sm">Connected as <strong>{drive.googleEmail}</strong>.</p>
          ) : (
            <p className="text-sm text-neutral-600">{drive?.expired ? `The connection to ${drive.googleEmail} expired or was revoked.` : "Not connected yet."}</p>
          )}
          <Button asChild variant={drive?.connected ? "outline" : "default"}>
            <a href="/api/admin/drive/connect">{drive?.connected ? "Reconnect" : "Connect Google Drive"}</a>
          </Button>
        </CardContent>
      </Card>

      {/* Managed-client administration lives on its own page: creating a client, granting and
          revoking portal access, and writing and publishing weekly reports is a workflow, not a
          widget, and it does not belong wedged between two tables. */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Client portals</CardTitle>
          <CardDescription>
            Managed profile-management clients — onboard a client, grant or revoke portal access against a
            verified account, add their Upwork profiles, and write and publish their weekly reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild><a href="/admin/clients">Open client portal management</a></Button>
        </CardContent>
      </Card>

      <AnnouncementComposer initial={announcements} />

      <AdminInbox leads={leads} managementEnquiries={managementEnquiries} />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Subscriptions &amp; payments</CardTitle>
          <CardDescription>No payment provider is connected. Plan changes below are entered by hand from whatever the admin was told (bank transfer, EasyPaisa, cash, etc.) — never a real card or account number.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>Manual plan management only</AlertTitle>
            <AlertDescription>
              Free accounts can preview a full audit on-screen but cannot download the PDF/Word report or see the AI Optimization section — both are
              enforced server-side, not just hidden in the UI. Use &quot;Manage plan&quot; on a user below to switch them to Subscriber and record what
              you were paid. Every change is written to the admin audit log. Connect a real payment provider (e.g. Stripe) to automate this later.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader><CardTitle>Users ({users.length})</CardTitle></CardHeader>
        <CardContent>
          <Table className="min-w-max">
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Mobile</TableHead><TableHead>Role</TableHead><TableHead>Plan</TableHead><TableHead>Verified</TableHead><TableHead>Last sign-in</TableHead><TableHead>Audits</TableHead><TableHead>Joined</TableHead><TableHead>Subscription</TableHead></TableRow></TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.fullName || "—"}</TableCell>
                  <TableCell>{u.mobile || "—"}</TableCell>
                  <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge></TableCell>
                  <TableCell><Badge variant={u.auditEntitlement === "free" ? "secondary" : "default"}>{u.auditEntitlement}</Badge>{u.auditCredits > 0 && <span className="ix-muted-inline"> +{Math.max(0, u.auditCredits - u.auditCreditsUsed)} credits</span>}</TableCell>
                  <TableCell>{u.emailVerified ? <Badge variant="default">verified</Badge> : <Badge variant="secondary">unverified</Badge>}</TableCell>
                  <TableCell>{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}</TableCell>
                  <TableCell>{u.auditCount}</TableCell>
                  <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openPlanDialog(u)}>Manage plan</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-neutral-500">Login credentials are never shown here — password resets go through the normal &quot;forgot password&quot; flow on the login page.</p>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Optimization requests {loadingOpt ? "" : `(${optRequests.length})`}</CardTitle>
          <CardDescription>&quot;Request optimization by a person&quot; queue from the report&apos;s Optimization tab.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingOpt ? <p className="text-sm text-neutral-500">Loading…</p> : optRequests.length === 0 ? <p className="text-sm text-neutral-500">No requests yet.</p> : (
            <Table className="min-w-max">
              <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Profile link</TableHead><TableHead>Notes</TableHead><TableHead>Status</TableHead><TableHead>Requested</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {optRequests.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.userEmail}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{r.profileUrl || "—"}</TableCell>
                    <TableCell className="max-w-[280px]">{r.notes}</TableCell>
                    <TableCell><Badge variant={r.status === "done" ? "default" : r.status === "in_progress" ? "outline" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {r.status !== "in_progress" && (
                        <Button size="sm" variant="outline" className="mr-2" disabled={updatingOpt === r.id} onClick={() => void setOptStatus(r.id, "in_progress")}>In progress</Button>
                      )}
                      {r.status !== "done" && (
                        <Button size="sm" disabled={updatingOpt === r.id} onClick={() => void setOptStatus(r.id, "done")}>Mark done</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!planUser} onOpenChange={open => !open && setPlanUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage plan — {planUser?.email}</DialogTitle>
            <DialogDescription>Manual entry only. No card or account number is ever stored — reference/note is whatever you were told (a transaction id, a receipt note).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Plan</label>
              <Select value={planForm.auditEntitlement} onValueChange={v => setPlanForm(f => ({ ...f, auditEntitlement: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="free">Free (preview only)</SelectItem><SelectItem value="subscribed">Subscribed (full access)</SelectItem><SelectItem value="admin_granted">Granted by Improvexus (full access)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Amount</label><Input className="mt-1" type="number" min="0" value={planForm.amount} onChange={e => setPlanForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" /></div>
              <div><label className="text-sm font-medium">Currency</label><Input className="mt-1" value={planForm.currency} onChange={e => setPlanForm(f => ({ ...f, currency: e.target.value }))} placeholder="PKR" /></div>
            </div>
            <div>
              <label className="text-sm font-medium">Method</label>
              <Select value={planForm.method} onValueChange={v => setPlanForm(f => ({ ...f, method: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{paymentMethods.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-sm font-medium">Reference</label><Input className="mt-1" value={planForm.reference} onChange={e => setPlanForm(f => ({ ...f, reference: e.target.value }))} placeholder="Transaction id / receipt note" /></div>
            <div><label className="text-sm font-medium">Note</label><Textarea className="mt-1" value={planForm.note} onChange={e => setPlanForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" /></div>
            <Button className="w-full" disabled={savingPlan} onClick={() => void savePlan()}>{savingPlan ? "Saving…" : "Save plan"}</Button>
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1">History</p>
              {loadingRecords ? <p className="text-xs text-neutral-500">Loading…</p> : planRecords.length === 0 ? <p className="text-xs text-neutral-500">No records yet.</p> : (
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {planRecords.map(r => (
                    <li key={r.id} className="border-b pb-1">
                      {new Date(r.createdAt).toLocaleString()} · {r.plan} · {r.amount ? `${r.amount} ${r.currency}` : "—"} {r.method && `· ${r.method}`} {r.reference && `· ${r.reference}`} · by {r.recordedByEmail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle>Recent reports ({audits.length})</CardTitle></CardHeader>
        <CardContent>
          <Table className="min-w-max">
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Profile</TableHead><TableHead>Score</TableHead><TableHead>Provider</TableHead><TableHead>Billable</TableHead><TableHead>Status</TableHead><TableHead>Generated</TableHead><TableHead>Retry filing / email</TableHead></TableRow></TableHeader>
            <TableBody>
              {audits.map(a => (
                <TableRow key={a.id}>
                  <TableCell>{a.userEmail}</TableCell>
                  <TableCell>{a.profileName || "—"}</TableCell>
                  <TableCell>{a.passCount + a.weakCount + a.failCount ? a.score.toFixed(1) : "N/A"}</TableCell>
                  <TableCell>{a.provider}</TableCell>
                  <TableCell><Badge variant={a.billable ? "default" : "secondary"}>{a.billable ? "yes" : "no"}</Badge></TableCell>
                  <TableCell><Badge variant={a.status === "completed" ? "default" : a.status === "reserved" ? "outline" : "secondary"}>{a.status}</Badge></TableCell>
                  <TableCell>{new Date(a.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" disabled={retrying === a.id || a.status !== "completed"} onClick={() => void retryDelivery(a.id)}>
                      {retrying === a.id ? "Retrying…" : "Retry"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
