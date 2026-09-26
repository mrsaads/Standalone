"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { METRIC_KEYS, METRIC_META, NOT_PROVIDED } from "@/lib/report-metrics";
import { REPORT_TEXT_FIELDS, type AdminWorkspaceRow, type ReportTextKey } from "@/lib/admin-clients-shared";
import { Panel, TableScroll } from "../admin-shell";

// Client-portal management.
//
// Every mutation goes to an admin-only API route and is followed by router.refresh(), so what is on
// screen is always what the server last said rather than an optimistic guess this component
// invented. For an admin screen that grants and revokes access to other people's data, being
// correct matters more than feeling instant.

// Monday-to-Sunday of the week that just finished — the period a weekly report is normally written
// for, so the common case needs no date typing at all.
function lastCompletedWeek(): { start: string; end: string } {
  const now = new Date();
  const day = now.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  const lastSunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const lastMonday = new Date(lastSunday);
  lastMonday.setUTCDate(lastSunday.getUTCDate() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(lastMonday), end: iso(lastSunday) };
}

type MetricDraft = Record<string, string>;

export function ClientsAdmin({ workspaces, metricsByReport }: {
  workspaces: AdminWorkspaceRow[];
  metricsByReport: Record<string, Record<string, number | null>>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(workspaces[0]?.id ?? null);

  // ---------------------------------------------------------------------------------- new client
  const [newClient, setNewClient] = useState({ name: "", accountManager: "", serviceStartDate: "", objectives: "" });

  // --------------------------------------------------------------------------- per-client drafts
  const [grantEmail, setGrantEmail] = useState<Record<string, string>>({});
  const [newProfile, setNewProfile] = useState<Record<string, { name: string; upworkUrl: string }>>({});
  const week = lastCompletedWeek();
  const [newReport, setNewReport] = useState<Record<string, { workspaceProfileId: string; periodStart: string; periodEnd: string; title: string }>>({});

  // ------------------------------------------------------------------------------- report editor
  const [editing, setEditing] = useState<{ workspaceId: string; reportId: string } | null>(null);
  const [reportDraft, setReportDraft] = useState<Record<ReportTextKey, string>>({
    title: "", overview: "", goals: "", workCompleted: "", nextActions: "", clientActions: "",
  });
  const [metricDraft, setMetricDraft] = useState<MetricDraft>({});

  async function call(url: string, payload: Record<string, unknown>, success?: string) {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string };
      if (!response.ok || result.ok !== true) throw new Error(result.error || "That did not work.");
      if (success) toast.success(success);
      router.refresh();
      return result;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That did not work.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function openReport(workspace: AdminWorkspaceRow, reportId: string) {
    const report = workspace.reports.find(r => r.id === reportId);
    if (!report) return;
    const stored = metricsByReport[reportId] ?? {};
    setReportDraft({
      title: report.title,
      // The other long fields are not in the list payload (they would make the page heavy for no
      // reason), so the editor starts from what the list knows and the admin edits what they need;
      // a field left untouched is not sent, so nothing gets blanked by opening the dialog.
      overview: "", goals: "", workCompleted: "", nextActions: "", clientActions: "",
    });
    setMetricDraft(Object.fromEntries(METRIC_KEYS.map(key => {
      const value = stored[key];
      return [key, value === null || value === undefined ? "" : String(value)];
    })));
    setEditing({ workspaceId: workspace.id, reportId });
  }

  async function saveReport() {
    if (!editing) return;
    const patch: Record<string, string> = {};
    for (const field of REPORT_TEXT_FIELDS) {
      const value = reportDraft[field.key];
      // Only fields the admin actually typed into are sent. An empty box means "I did not edit
      // this", not "blank it" — anything else would let opening the dialog destroy existing copy.
      if (value.trim().length > 0) patch[field.key] = value;
    }
    if (Object.keys(patch).length > 0) {
      const saved = await call(`/api/admin/reports/${editing.reportId}`, { action: "update", ...patch });
      if (!saved) return;
    }

    const stored = metricsByReport[editing.reportId] ?? {};
    for (const key of METRIC_KEYS) {
      const raw = (metricDraft[key] ?? "").trim();
      // Empty => null => "Not provided" to the client. NOT zero: zero is a real measurement and
      // writing it here would invent a result nobody reported.
      const next = raw === "" ? null : Number(raw);
      if (next !== null && Number.isNaN(next)) {
        toast.error(`${METRIC_META[key].label}: enter a number, or leave it empty for "${NOT_PROVIDED}".`);
        return;
      }
      const before = stored[key] ?? null;
      if (next === before) continue;
      const saved = await call(`/api/admin/reports/${editing.reportId}`, { action: "set_metric", metricKey: key, value: next });
      if (!saved) return;
    }

    toast.success("Report saved. It stays a draft until you publish it.");
    setEditing(null);
  }

  return (
    <>
      <Alert className="mb-6">
        <AlertTitle>How access works here</AlertTitle>
        <AlertDescription>
          Portal access is granted only from this page, only to an account that exists and has confirmed
          its email address, and it is stored against that verified account — never against a typed-in
          address. It is completely separate from a person&apos;s audit plan: a managed client reads their
          reports with no audit entitlement and is never asked to pay to read them. Revoking sets the
          membership inactive and keeps the history; nothing is deleted.
        </AlertDescription>
      </Alert>

      <Panel
        title="Onboard a client"
        description="Creating a client grants nobody anything — you assign people to it in the next step."
      >
        <div className="ix-stack">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium" htmlFor="nc-name">Client name</label>
              <Input id="nc-name" className="mt-1" value={newClient.name} maxLength={120}
                onChange={e => setNewClient(v => ({ ...v, name: e.target.value }))} placeholder="Ayesha Khan" />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="nc-am">Account manager</label>
              <Input id="nc-am" className="mt-1" value={newClient.accountManager} maxLength={120}
                onChange={e => setNewClient(v => ({ ...v, accountManager: e.target.value }))} placeholder="Who runs this account" />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="nc-start">Service start date</label>
              <Input id="nc-start" className="mt-1" type="date" value={newClient.serviceStartDate}
                onChange={e => setNewClient(v => ({ ...v, serviceStartDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="nc-obj">Objectives</label>
            <Textarea id="nc-obj" className="mt-1" rows={2} maxLength={2000} value={newClient.objectives}
              onChange={e => setNewClient(v => ({ ...v, objectives: e.target.value }))}
              placeholder="What this client hired us to achieve." />
          </div>
          <Button
            disabled={busy || newClient.name.trim().length < 2}
            onClick={async () => {
              const created = await call("/api/admin/workspaces", newClient, `${newClient.name.trim()} created.`);
              if (created) {
                setNewClient({ name: "", accountManager: "", serviceStartDate: "", objectives: "" });
                if (typeof created.id === "string") setOpen(created.id);
              }
            }}
          >
            {busy ? "Working…" : "Create client"}
          </Button>
        </div>
      </Panel>

      {workspaces.length === 0 ? (
        <div className="ix-empty">
          <h3>No clients yet</h3>
          <p>Onboard your first managed client above. Their portal, their assigned people and their weekly reports all hang off that record.</p>
        </div>
      ) : workspaces.map(ws => {
        const activeMembers = ws.members.filter(m => m.status === "active");
        const activeProfiles = ws.profiles.filter(p => p.status === "active");
        const expanded = open === ws.id;
        const reportDraftFor = newReport[ws.id] ?? { workspaceProfileId: activeProfiles[0]?.id ?? "", periodStart: week.start, periodEnd: week.end, title: "" };

        return (
          <Panel
            key={ws.id}
            title={<>
              {ws.name}
              <Badge variant={ws.status === "active" ? "default" : "destructive"}>{ws.status}</Badge>
            </>}
            description={<>
              /{ws.slug} · {activeMembers.length} with access · {activeProfiles.length} managed {activeProfiles.length === 1 ? "profile" : "profiles"} ·{" "}
              {ws.reports.filter(r => r.status === "published").length} published {ws.reports.filter(r => r.status === "published").length === 1 ? "report" : "reports"}
              {ws.accountManager && ` · managed by ${ws.accountManager}`}
              {ws.serviceStartDate && ` · since ${ws.serviceStartDate}`}
            </>}
            actions={<>
              <Button size="sm" variant="outline" onClick={() => setOpen(expanded ? null : ws.id)}>
                {expanded ? "Collapse" : "Manage"}
              </Button>
              <Button size="sm" variant={ws.status === "active" ? "outline" : "default"} disabled={busy}
                onClick={() => void call(`/api/admin/workspaces/${ws.id}`, { action: "update", status: ws.status === "active" ? "suspended" : "active" },
                  ws.status === "active" ? `${ws.name} suspended — their portal is closed until you reactivate it.` : `${ws.name} reactivated.`)}>
                {ws.status === "active" ? "Suspend" : "Reactivate"}
              </Button>
            </>}
          >
            {!expanded ? null : (
              <div className="ix-stack--lg ix-stack">
                {ws.objectives && (
                  <p className="ix-notice" style={{ whiteSpace: "pre-wrap" }}>{ws.objectives}</p>
                )}

                {/* ------------------------------------------------------------------- access */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Who can see this portal</h3>
                  {ws.members.length === 0 ? (
                    <p className="mb-3 text-sm text-neutral-500">Nobody yet. Until you assign somebody, this client&apos;s reports are visible to admins only.</p>
                  ) : (
                    <TableScroll><Table className="mb-3">
                      <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Granted</TableHead><TableHead>By</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {ws.members.map(m => (
                          <TableRow key={m.id}>
                            <TableCell>{m.userEmail}</TableCell>
                            <TableCell><Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge></TableCell>
                            <TableCell className="text-xs">{new Date(m.grantedAt).toLocaleDateString()}</TableCell>
                            <TableCell className="text-xs">{m.grantedByEmail || "—"}</TableCell>
                            <TableCell>
                              {m.status === "active" ? (
                                <Button size="sm" variant="outline" disabled={busy}
                                  onClick={() => void call(`/api/admin/workspaces/${ws.id}`, { action: "revoke_member", memberId: m.id }, `${m.userEmail} can no longer open this portal.`)}>
                                  Revoke
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" disabled={busy}
                                  onClick={() => void call(`/api/admin/workspaces/${ws.id}`, { action: "grant_member", email: m.userEmail }, `${m.userEmail} can open this portal again.`)}>
                                  Restore
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table></TableScroll>
                  )}
                  <div className="flex gap-2">
                    <Input placeholder="their@email.com" value={grantEmail[ws.id] ?? ""}
                      onChange={e => setGrantEmail(v => ({ ...v, [ws.id]: e.target.value }))} />
                    <Button className="shrink-0" disabled={busy || !(grantEmail[ws.id] ?? "").includes("@")}
                      onClick={async () => {
                        const done = await call(`/api/admin/workspaces/${ws.id}`, { action: "grant_member", email: grantEmail[ws.id] ?? "" }, "Access granted, and they have been notified in the app.");
                        if (done) setGrantEmail(v => ({ ...v, [ws.id]: "" }));
                      }}>
                      Grant access
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Must be an existing account with a confirmed email. If it is not, you will be told exactly which — no membership is created on a guess.
                  </p>
                </section>

                {/* ----------------------------------------------------------------- profiles */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Managed Upwork profiles</h3>
                  {ws.profiles.length === 0 ? (
                    <p className="mb-3 text-sm text-neutral-500">None yet. A weekly report is always written for one profile, so add at least one.</p>
                  ) : (
                    <TableScroll><Table className="mb-3">
                      <TableHeader><TableRow><TableHead>Profile</TableHead><TableHead>Upwork link</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {ws.profiles.map(p => (
                          <TableRow key={p.id}>
                            <TableCell>{p.name}</TableCell>
                            <TableCell className="max-w-[220px] truncate">
                              {p.upworkUrl ? <a href={p.upworkUrl} target="_blank" rel="noreferrer nofollow noopener" className="underline">{p.upworkUrl}</a> : "—"}
                            </TableCell>
                            <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" disabled={busy}
                                onClick={() => void call(`/api/admin/workspaces/${ws.id}`, { action: "set_profile_status", profileId: p.id, status: p.status === "active" ? "archived" : "active" })}>
                                {p.status === "active" ? "Archive" : "Restore"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table></TableScroll>
                  )}
                  <div className="flex gap-2">
                    <Input placeholder="Profile name" value={newProfile[ws.id]?.name ?? ""}
                      onChange={e => setNewProfile(v => ({ ...v, [ws.id]: { name: e.target.value, upworkUrl: v[ws.id]?.upworkUrl ?? "" } }))} />
                    <Input placeholder="https://www.upwork.com/freelancers/~…" value={newProfile[ws.id]?.upworkUrl ?? ""}
                      onChange={e => setNewProfile(v => ({ ...v, [ws.id]: { name: v[ws.id]?.name ?? "", upworkUrl: e.target.value } }))} />
                    <Button className="shrink-0" disabled={busy || !(newProfile[ws.id]?.name ?? "").trim()}
                      onClick={async () => {
                        const done = await call(`/api/admin/workspaces/${ws.id}`, { action: "add_profile", name: newProfile[ws.id]?.name ?? "", upworkUrl: newProfile[ws.id]?.upworkUrl ?? "" }, "Profile added.");
                        if (done) setNewProfile(v => ({ ...v, [ws.id]: { name: "", upworkUrl: "" } }));
                      }}>
                      Add profile
                    </Button>
                  </div>
                </section>

                {/* ------------------------------------------------------------------ reports */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Weekly reports</h3>
                  {ws.reports.length === 0 ? (
                    <p className="mb-3 text-sm text-neutral-500">No reports yet.</p>
                  ) : (
                    <TableScroll><Table className="mb-3">
                      <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Profile</TableHead><TableHead>Title</TableHead><TableHead>Metrics</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {ws.reports.map(r => {
                          const profile = ws.profiles.find(p => p.id === r.workspaceProfileId);
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="whitespace-nowrap text-xs">{r.periodStart} → {r.periodEnd}</TableCell>
                              <TableCell>{profile?.name ?? "—"}</TableCell>
                              <TableCell className="max-w-[180px] truncate">{r.title || "—"}</TableCell>
                              <TableCell className="text-xs">
                                {r.metricCount}/{METRIC_KEYS.length}
                                {r.metricCount < METRIC_KEYS.length && <span className="ix-muted-inline"> · rest show &quot;{NOT_PROVIDED}&quot;</span>}
                              </TableCell>
                              <TableCell>
                                <Badge variant={r.status === "published" ? "default" : "secondary"}>{r.status}</Badge>
                                {r.publishedAt && <span className="ix-muted-inline block text-xs">{new Date(r.publishedAt).toLocaleDateString()}</span>}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Button size="sm" variant="outline" className="mr-2" onClick={() => openReport(ws, r.id)}>Edit</Button>
                                {r.status === "draft" ? (
                                  <Button size="sm" disabled={busy}
                                    onClick={async () => {
                                      const result = await call(`/api/admin/reports/${r.id}`, { action: "publish" });
                                      if (!result) return;
                                      const notified = Number(result.notified ?? 0);
                                      const members = Number(result.activeMembers ?? 0);
                                      if (members === 0) toast.warning("Published, but nobody is assigned to this client yet — no one was notified.");
                                      else if (result.workspaceSuspended) toast.warning(`Published and ${notified} notified, but this client is suspended so they cannot open the portal.`);
                                      else toast.success(`Published. ${notified} of ${members} notified${notified < members ? " (the rest already had this notification)" : ""}.`);
                                    }}>
                                    Publish
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" disabled={busy}
                                    onClick={() => void call(`/api/admin/reports/${r.id}`, { action: "unpublish" }, "Back to draft — the client can no longer open it.")}>
                                    Unpublish
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table></TableScroll>
                  )}

                  {activeProfiles.length === 0 ? (
                    <p className="text-xs text-neutral-500">Add a managed profile above before writing a report.</p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-5">
                      <Select value={reportDraftFor.workspaceProfileId}
                        onValueChange={v => setNewReport(s => ({ ...s, [ws.id]: { ...reportDraftFor, workspaceProfileId: v } }))}>
                        <SelectTrigger><SelectValue placeholder="Profile" /></SelectTrigger>
                        <SelectContent>{activeProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="date" value={reportDraftFor.periodStart}
                        onChange={e => setNewReport(s => ({ ...s, [ws.id]: { ...reportDraftFor, periodStart: e.target.value } }))} />
                      <Input type="date" value={reportDraftFor.periodEnd}
                        onChange={e => setNewReport(s => ({ ...s, [ws.id]: { ...reportDraftFor, periodEnd: e.target.value } }))} />
                      <Input placeholder="Title (optional)" value={reportDraftFor.title}
                        onChange={e => setNewReport(s => ({ ...s, [ws.id]: { ...reportDraftFor, title: e.target.value } }))} />
                      <Button disabled={busy || !reportDraftFor.workspaceProfileId}
                        onClick={async () => {
                          const done = await call(`/api/admin/workspaces/${ws.id}`, { action: "create_report", ...reportDraftFor }, "Draft created — write it up, then publish.");
                          if (done) setNewReport(s => ({ ...s, [ws.id]: { ...reportDraftFor, title: "" } }));
                        }}>
                        New draft
                      </Button>
                    </div>
                  )}
                </section>
              </div>
            )}
          </Panel>
        );
      })}

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit weekly report</DialogTitle>
            <DialogDescription>
              Written by you, not generated — no AI call is involved, so this works whatever the AI credit
              balance is. A box you leave empty is not sent, so it keeps whatever is already saved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {REPORT_TEXT_FIELDS.map(field => (
              <div key={field.key}>
                <label className="text-sm font-medium" htmlFor={`rf-${field.key}`}>{field.label}</label>
                {field.rows === 1 ? (
                  <Input id={`rf-${field.key}`} className="mt-1" value={reportDraft[field.key]} placeholder={field.placeholder}
                    onChange={e => setReportDraft(d => ({ ...d, [field.key]: e.target.value }))} />
                ) : (
                  <Textarea id={`rf-${field.key}`} className="mt-1" rows={field.rows} value={reportDraft[field.key]} placeholder={field.placeholder}
                    onChange={e => setReportDraft(d => ({ ...d, [field.key]: e.target.value }))} />
                )}
              </div>
            ))}

            <div>
              <p className="text-sm font-medium">Metrics</p>
              <p className="mb-2 text-xs text-neutral-500">
                Leave a box empty for &quot;{NOT_PROVIDED}&quot;. Enter 0 only when 0 is the real number — the client&apos;s
                report shows those two differently, and always will.
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {METRIC_KEYS.map(key => (
                  <div key={key}>
                    <label className="text-xs font-medium" htmlFor={`mk-${key}`}>{METRIC_META[key].label}</label>
                    <Input id={`mk-${key}`} className="mt-1" inputMode="decimal" value={metricDraft[key] ?? ""}
                      placeholder={NOT_PROVIDED}
                      onChange={e => setMetricDraft(d => ({ ...d, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full" disabled={busy} onClick={() => void saveReport()}>
              {busy ? "Saving…" : "Save report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
