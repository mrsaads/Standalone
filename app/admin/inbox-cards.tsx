"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import type { AdminLeadRow, AdminManagementEnquiryRow } from "@/lib/admin-inbox-shared";
import { LEAD_SOURCE_LABEL } from "@/lib/admin-inbox-shared";
import { Panel, TableScroll } from "./admin-shell";

// The two inbound queues that the admin panel was missing entirely.
//
// Both lists arrive already loaded from the server component rather than being fetched here on
// mount — they are part of the page's own data, so there is no spinner, and no window in which an
// admin sees "no enquiries yet" on a page that in fact has rows in it. That reassuring-but-wrong
// empty state is close to how the original bug stayed invisible for as long as it did.

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "actioned" || status === "converted") return "default";
  if (status === "reviewed" || status === "contacted") return "outline";
  if (status === "declined") return "destructive";
  return "secondary";
}

export function AdminInbox({
  leads: initialLeads,
  managementEnquiries: initialEnquiries,
}: {
  leads: AdminLeadRow[];
  managementEnquiries: AdminManagementEnquiryRow[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [enquiries, setEnquiries] = useState(initialEnquiries);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(endpoint: string, id: string, status: string, apply: () => void) {
    setBusy(id);
    try {
      const response = await fetch(`${endpoint}/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "The status could not be updated.");
      apply();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The status could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  const newLeads = leads.filter(l => l.status === "new").length;
  const newEnquiries = enquiries.filter(e => e.status === "new").length;

  return (
    <>
      <Panel
        title={<>Website enquiries <span className="ix-muted-inline">({leads.length})</span></>}
        description="Every submission from the public site — the free-audit form, the client-portal form, and the general enquiry form. These are leads, not accounts: marking one “actioned” records what you did and grants nothing."
        actions={newLeads > 0
          ? <span className="ix-badge ix-badge--accent">{newLeads} new</span>
          : <span className="ix-badge">All handled</span>}
        flush
      >
        {leads.length === 0 ? (
          <p className="ix-none" style={{ padding: 20 }}>No enquiries yet.</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  {/* Eight columns did not fit the page, so the Action buttons sat off the right
                      edge behind a horizontal scroll — on the one table whose whole purpose is to
                      be acted on. Name+email and source+date are paired into single cells instead. */}
                  <TableHead>Who</TableHead><TableHead>From</TableHead>
                  <TableHead>Upwork profile</TableHead><TableHead>What they asked for</TableHead>
                  <TableHead>Status</TableHead><TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="block">{row.name}</span>
                      <span className="ix-muted-inline block">{row.email}</span>
                      {row.hasAccount && <span className="ix-muted-inline block">Has an Improvexus account</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="block">{LEAD_SOURCE_LABEL[row.source] ?? row.source}</span>
                      <span className="ix-muted-inline block">{new Date(row.createdAt).toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {/* A lead's link is text a stranger typed into a public form, so it never gets
                          a window handle onto this page — hence noopener alongside noreferrer. */}
                      {row.profileLink
                        ? <a href={row.profileLink} rel="noreferrer nofollow noopener" target="_blank" className="ix-link">{row.profileLink}</a>
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[300px] whitespace-pre-wrap text-xs">{row.goals || "—"}</TableCell>
                    <TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.status !== "reviewed" && row.status !== "actioned" && (
                        <Button size="sm" variant="outline" className="mr-2" disabled={busy === row.id}
                          onClick={() => void setStatus("/api/admin/leads", row.id, "reviewed",
                            () => setLeads(rows => rows.map(r => r.id === row.id ? { ...r, status: "reviewed" } : r)))}>
                          Reviewed
                        </Button>
                      )}
                      {row.status !== "actioned" && (
                        <Button size="sm" disabled={busy === row.id}
                          onClick={() => void setStatus("/api/admin/leads", row.id, "actioned",
                            () => setLeads(rows => rows.map(r => r.id === row.id ? { ...r, status: "actioned" } : r)))}>
                          Actioned
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </Panel>

      <Panel
        title={<>Management service requests <span className="ix-muted-inline">({enquiries.length})</span></>}
        description="Signed-in users asking Improvexus to manage their profile, from the “Managed client portal” card on their dashboard. Marking one “converted” is a note about your decision — you still have to create the client and grant access in Client portals."
        actions={newEnquiries > 0
          ? <span className="ix-badge ix-badge--accent">{newEnquiries} new</span>
          : <span className="ix-badge">All handled</span>}
        flush
      >
        {enquiries.length === 0 ? (
          <p className="ix-none" style={{ padding: 20 }}>No requests yet.</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead><TableHead>Message</TableHead><TableHead>Status</TableHead>
                  <TableHead>Handled by</TableHead><TableHead>Requested</TableHead><TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enquiries.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>{row.userEmail}</TableCell>
                    <TableCell className="max-w-[340px] whitespace-pre-wrap text-xs">{row.message || "—"}</TableCell>
                    <TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell>
                    <TableCell className="text-xs">{row.handledByEmail || "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {(["contacted", "converted", "declined"] as const).map(next => row.status === next ? null : (
                        <Button key={next} size="sm" variant={next === "converted" ? "default" : "outline"} className="mr-2"
                          disabled={busy === row.id}
                          onClick={() => void setStatus("/api/admin/management-enquiries", row.id, next,
                            () => setEnquiries(rows => rows.map(r => r.id === row.id ? { ...r, status: next } : r)))}>
                          {next === "contacted" ? "Contacted" : next === "converted" ? "Converted" : "Declined"}
                        </Button>
                      ))}
                    </TableCell>
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
