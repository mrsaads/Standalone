"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Panel, TableScroll } from "../admin-shell";

// The "request optimization by a person" queue from a report's Optimization tab.
//
// Loaded by the server page and passed in, rather than fetched here on mount. The old version
// fetched on mount and showed "Loading…" then "No requests yet" — which is exactly the shape that
// let an empty-because-wrong-table queue look like an empty-because-nothing-happened queue.

export type OptimizationRequest = {
  id: string;
  userEmail: string;
  auditId: string | null;
  profileUrl: string;
  notes: string;
  status: string;
  createdAt: string;
};

const NEXT_STATUS = [
  { value: "in_progress", label: "In progress", variant: "outline" as const },
  { value: "done", label: "Mark done", variant: "default" as const },
];

export function RequestsAdmin({ initial }: { initial: OptimizationRequest[] }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      const response = await fetch(`/api/admin/optimization-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error || "The status could not be updated.");
      }
      setRequests(rows => rows.map(r => r.id === id ? { ...r, status } : r));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The status could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  const open = requests.filter(r => r.status !== "done").length;

  return (
    <Panel
      title={<>Optimization requests <span className="ix-muted-inline">({requests.length})</span></>}
      description="Someone read their audit and asked for a human to work on their profile. Each one is a person expecting to hear back."
      actions={open > 0
        ? <span className="ix-badge ix-badge--accent">{open} open</span>
        : <span className="ix-badge">Queue clear</span>}
      flush
    >
      {requests.length === 0 ? (
        <p className="ix-admin-none" style={{ padding: 20 }}>
          No requests yet. These arrive from the Optimization tab of a completed audit report.
        </p>
      ) : (
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead><TableHead>Profile link</TableHead><TableHead>Notes</TableHead>
                <TableHead>Status</TableHead><TableHead>Requested</TableHead><TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.userEmail}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {r.profileUrl
                      ? <a href={r.profileUrl} rel="noreferrer nofollow noopener" target="_blank" className="ix-link">{r.profileUrl}</a>
                      : "—"}
                  </TableCell>
                  <TableCell className="max-w-[320px] whitespace-pre-wrap text-xs">{r.notes || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "done" ? "default" : r.status === "in_progress" ? "outline" : "secondary"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{new Date(r.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {NEXT_STATUS.map(next => r.status === next.value ? null : (
                      <Button key={next.value} size="sm" variant={next.variant} className="mr-2"
                        disabled={busy === r.id} onClick={() => void setStatus(r.id, next.value)}>
                        {next.label}
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
  );
}
