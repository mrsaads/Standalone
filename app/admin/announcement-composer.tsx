"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AUDIENCE_LABEL, type Audience, type AnnouncementListRow } from "@/lib/announcement-shared";
import { Panel, TableScroll } from "./admin-shell";

// The admin notification composer.
//
// Two-step by design: "Check who this reaches" resolves the audience server-side and shows a real
// count and a sample of addresses, and only then does the Send button appear. A broadcast that
// cannot be un-sent should not be one click away from a typo in an audience selector.
//
// Every recipient is an account, so there is no free-text "send to this address" path that could
// reach somebody who never signed up — an email that matches no account comes back in `unmatched`
// and is reported rather than silently dropped.

type Preview = { recipientCount: number; suppressed: number; unmatched: string[]; sample: string[] };

const AUDIENCE_ORDER: Audience[] = ["everyone", "selected", "managed_clients", "subscribers", "audit_users"];

export function AnnouncementComposer({ initial }: { initial: AnnouncementListRow[] }) {
  const [sent, setSent] = useState(initial);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("selected");
  const [emails, setEmails] = useState("");
  const [category, setCategory] = useState<"service" | "promotional">("service");
  const [actionLabel, setActionLabel] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const emailList = emails.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean);

  // Any edit invalidates a preview — otherwise an admin could check the audience, change it, and
  // send against a count that no longer describes what is about to happen.
  function edited<T>(setter: (value: T) => void) {
    return (value: T) => { setPreview(null); setter(value); };
  }

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((result as { error?: string }).error || "The request failed.");
    return result;
  }

  const payload = () => ({
    title: title.trim(),
    body: body.trim(),
    audience,
    emails: audience === "selected" ? emailList : [],
    category,
    actionLabel: actionLabel.trim(),
    actionUrl: actionUrl.trim(),
  });

  async function checkAudience() {
    setBusy(true);
    try {
      setPreview(await post({ ...payload(), preview: true }) as Preview);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The audience could not be checked.");
    } finally { setBusy(false); }
  }

  async function send() {
    setBusy(true);
    try {
      const result = await post(payload()) as {
        announcementId: string; recipientCount: number; notificationsCreated: number;
        skippedAsDuplicate: number; suppressed: number;
      };
      toast.success(
        `Sent to ${result.notificationsCreated} ${result.notificationsCreated === 1 ? "person" : "people"}`
        + (result.suppressed > 0 ? ` · ${result.suppressed} suppressed (marketing opt-out)` : ""),
      );
      setSent(rows => [{
        id: result.announcementId, title: title.trim(), body: body.trim(), audience, category,
        channel: "in_app", status: "sent", recipientCount: result.recipientCount, readCount: 0,
        actionLabel: actionLabel.trim(), actionUrl: actionUrl.trim(), createdByEmail: "you",
        createdAt: new Date().toISOString(), sentAt: new Date().toISOString(),
      }, ...rows]);
      setTitle(""); setBody(""); setActionLabel(""); setActionUrl(""); setEmails(""); setPreview(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The announcement could not be sent.");
    } finally { setBusy(false); }
  }

  const ready = title.trim().length >= 3 && body.trim().length > 0 && (audience !== "selected" || emailList.length > 0);

  return (
    <>
      <Panel
        title="Compose"
        description="Send a message to everybody, to one audience, or to one person by email. It appears in that person’s notification centre — the count in their header and their Notifications page — on their next page load."
      >
        <div className="ix-stack">
          <Alert>
            <AlertTitle>In-app only</AlertTitle>
            <AlertDescription>
              This sends an in-app notification. No email is sent to anybody — the email channel is not
              wired up, so nothing here can reach a customer&apos;s inbox. To try it safely, choose
              &quot;Specific people&quot; and enter your own address first.
            </AlertDescription>
          </Alert>

          <div className="ix-grid-auto">
            <div>
              <label className="text-sm font-medium" htmlFor="ann-audience">Send to</label>
              <Select value={audience} onValueChange={v => edited<Audience>(setAudience)(v as Audience)}>
                <SelectTrigger id="ann-audience" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCE_ORDER.map(key => <SelectItem key={key} value={key}>{AUDIENCE_LABEL[key]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="ann-category">Type</label>
              <Select value={category} onValueChange={v => edited<"service" | "promotional">(setCategory)(v as "service" | "promotional")}>
                <SelectTrigger id="ann-category" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service notification (everyone gets it)</SelectItem>
                  <SelectItem value="promotional">Promotional (skips marketing opt-outs)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {audience === "selected" && (
            <div>
              <label className="text-sm font-medium" htmlFor="ann-emails">Email addresses</label>
              <Textarea id="ann-emails" className="mt-1" rows={2} value={emails}
                onChange={e => edited(setEmails)(e.target.value)}
                placeholder="one@example.com, two@example.com" />
              <p className="ix-field-help mt-1">
                Separate with commas, spaces or new lines. {emailList.length > 0 && `${emailList.length} entered. `}
                An address with no Improvexus account is reported back, not silently skipped.
              </p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium" htmlFor="ann-title">Title</label>
            <Input id="ann-title" className="mt-1" maxLength={120} value={title}
              onChange={e => edited(setTitle)(e.target.value)} placeholder="Your weekly report is ready" />
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="ann-body">Message</label>
            <Textarea id="ann-body" className="mt-1" rows={4} maxLength={4000} value={body}
              onChange={e => edited(setBody)(e.target.value)}
              placeholder="Plain text, written exactly as you type it. No AI is involved, so this keeps working whatever the AI credit balance is." />
          </div>

          <div className="ix-grid-auto">
            <div>
              <label className="text-sm font-medium" htmlFor="ann-action-label">Button label (optional)</label>
              <Input id="ann-action-label" className="mt-1" maxLength={60} value={actionLabel}
                onChange={e => edited(setActionLabel)(e.target.value)} placeholder="Open my report" />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="ann-action-url">Links to (optional)</label>
              <Input id="ann-action-url" className="mt-1" maxLength={300} value={actionUrl}
                onChange={e => edited(setActionUrl)(e.target.value)} placeholder="/portal" />
              <p className="ix-field-help mt-1">
                A path on this site only, starting with &quot;/&quot;. An external address is refused, not stored.
              </p>
            </div>
          </div>

          {preview && (
            <Alert variant={preview.recipientCount === 0 ? "destructive" : "default"}>
              <AlertTitle>
                {preview.recipientCount === 0
                  ? "This would reach nobody"
                  : `This will reach ${preview.recipientCount} ${preview.recipientCount === 1 ? "person" : "people"}`}
              </AlertTitle>
              <AlertDescription>
                {preview.sample.length > 0 && (
                  <span className="block">
                    {preview.sample.join(", ")}
                    {preview.recipientCount > preview.sample.length ? ` and ${preview.recipientCount - preview.sample.length} more` : ""}
                  </span>
                )}
                {preview.suppressed > 0 && <span className="block">{preview.suppressed} excluded because they opted out of marketing.</span>}
                {preview.unmatched.length > 0 && <span className="block">No Improvexus account for: {preview.unmatched.join(", ")} — these will not be notified.</span>}
              </AlertDescription>
            </Alert>
          )}

          <div className="ix-actions">
            <Button variant="outline" disabled={!ready || busy} onClick={() => void checkAudience()}>
              {busy && !preview ? "Checking…" : "Check who this reaches"}
            </Button>
            <Button disabled={!preview || preview.recipientCount === 0 || busy} onClick={() => void send()}>
              {busy && preview ? "Sending…" : preview ? `Send to ${preview.recipientCount}` : "Send"}
            </Button>
            {!preview && <span className="ix-field-help">Check the audience first — sending cannot be undone.</span>}
          </div>
        </div>
      </Panel>

      <Panel
        title={<>Sent <span className="ix-muted-inline">({sent.length})</span></>}
        description="What has gone out, who it reached, and how many have opened it."
        flush
      >
        {sent.length === 0 ? (
          <p className="ix-none" style={{ padding: 20 }}>Nothing has been sent yet.</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead><TableHead>Audience</TableHead><TableHead>Type</TableHead>
                  <TableHead>Reached</TableHead><TableHead>Opened</TableHead><TableHead>Sent</TableHead><TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sent.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[280px]">
                      {/* Both lines are clipped, not just the body: a long title spilled out of the
                          cell and ran underneath the Audience column. */}
                      <span className="block max-w-[280px] truncate">{row.title}</span>
                      <span className="ix-muted-inline block max-w-[280px] truncate">{row.body}</span>
                    </TableCell>
                    <TableCell className="text-xs">{AUDIENCE_LABEL[row.audience as Audience] ?? row.audience}</TableCell>
                    <TableCell><Badge variant={row.category === "promotional" ? "outline" : "secondary"}>{row.category}</Badge></TableCell>
                    <TableCell>{row.recipientCount}</TableCell>
                    <TableCell>{row.readCount}</TableCell>
                    <TableCell className="text-xs">{row.sentAt ? new Date(row.sentAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-xs">{row.createdByEmail || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </Panel>
    </>
  );
}
