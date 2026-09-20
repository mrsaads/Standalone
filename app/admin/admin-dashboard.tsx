"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

type UserRow = { id: string; email: string; fullName: string; mobile: string; upworkLink: string; role: string; createdAt: string; lastSeenAt: string; auditCount: number };
type AuditRow = { id: string; userEmail: string; profileName: string; score: number; passCount: number; weakCount: number; failCount: number; provider: string; billable: boolean; status: string; createdAt: string };
type DriveStatus = { connected: boolean; googleEmail?: string; connectedAt?: string; expired?: boolean; error?: string };

const driveMessages: Record<string, { title: string; tone: "default" | "destructive" }> = {
  connected: { title: "Google Drive connected.", tone: "default" },
  denied: { title: "Google access was not granted.", tone: "destructive" },
  invalid_state: { title: "The connection attempt expired or was invalid. Try connecting again.", tone: "destructive" },
  failed: { title: "The Google Drive connection failed. Check the OAuth credentials and try again.", tone: "destructive" },
  forbidden: { title: "Admin access is required to connect Google Drive.", tone: "destructive" },
};

export function AdminDashboard({ adminEmail, users, audits }: { adminEmail: string; users: UserRow[]; audits: AuditRow[] }) {
  const params = useSearchParams();
  const driveParam = params.get("drive");
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [loadingDrive, setLoadingDrive] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

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
    <main className="mx-auto max-w-5xl px-6 py-10">
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

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Subscriptions &amp; checkout</CardTitle>
          <CardDescription>Disabled until a payment provider, prices, and credentials are configured.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>Checkout is intentionally turned off</AlertTitle>
            <AlertDescription>
              The original development brief that would define subscription tiers and pricing is not available in this session, and no payment
              provider account or API keys have been supplied. Base accounts remain limited to one audit per 7 days; admin accounts are unlimited.
              Enable checkout by supplying the tier/pricing spec plus a payment provider (e.g. Stripe) and its credentials.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader><CardTitle>Users ({users.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Mobile</TableHead><TableHead>Role</TableHead><TableHead>Audits</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.fullName || "—"}</TableCell>
                  <TableCell>{u.mobile || "—"}</TableCell>
                  <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge></TableCell>
                  <TableCell>{u.auditCount}</TableCell>
                  <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent reports ({audits.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
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
