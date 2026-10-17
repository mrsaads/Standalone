"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Banknote, Check, Copy, CreditCard, ExternalLink, LoaderCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// "Unlock this report": the one place a customer pays for a single audit report.
// What may be offered (price, JazzCash, bank/NayaPay transfer) comes from the server
// (GET /api/payments/options); this component decides nothing about money. The amount is never sent
// from here: the server uses its own price when it creates the order.

type Options = { pricePkr: number | null; jazzcash: boolean; manual: { text: string; link: string } | null; sandbox: boolean };
type Manual = { id: string; reference: string; amountPkr: number };

const rs = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

export function UnlockDialog({ open, onOpenChange, auditId, onContact }: { open: boolean; onOpenChange: (open: boolean) => void; auditId: string | null; onContact: () => void }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<"" | "jazzcash" | "manual" | "claim">("");
  const [manual, setManual] = useState<Manual | null>(null);
  const [note, setNote] = useState("");
  const [claimed, setClaimed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [checkout, setCheckout] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadError(""); setManual(null); setClaimed(false); setNote("");
    (async () => {
      try {
        const response = await fetch("/api/payments/options", { cache: "no-store" });
        if (!response.ok) throw new Error();
        setOptions(await response.json() as Options);
      } catch { setLoadError("We couldn't load the payment options. Please try again."); }
    })();
  }, [open]);

  // The signed form is rendered, then submitted: the browser goes to JazzCash, pays there, and comes back to us.
  useEffect(() => { if (checkout) formRef.current?.submit(); }, [checkout]);

  async function start(method: "jazzcash" | "manual") {
    if (!auditId || busy) return;
    setBusy(method);
    try {
      const response = await fetch("/api/payments/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId, method }) });
      const body = await response.json() as { error?: string; order?: Manual; checkout?: { url: string; fields: Record<string, string> } };
      if (!response.ok || !body.order) { toast.error(body.error || "We couldn't start the payment."); return; }
      if (method === "jazzcash" && body.checkout) { setCheckout(body.checkout); return; }
      setManual(body.order);
    } catch { toast.error("We couldn't start the payment. Please try again."); }
    finally { setBusy(prev => (prev === "jazzcash" ? prev : "")); }
  }

  async function claim() {
    if (!manual || busy) return;
    setBusy("claim");
    try {
      const response = await fetch(`/api/payments/orders/${manual.id}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      if (!response.ok) throw new Error();
      setClaimed(true);
    } catch { toast.error("We couldn't send that. Please try again."); }
    finally { setBusy(""); }
  }

  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { /* clipboard blocked: the text is on screen */ } };
  const offline = options && !options.jazzcash && !options.manual;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ix-dialog">
        <DialogHeader>
          <DialogTitle>Unlock this report</DialogTitle>
          <DialogDescription>Every finding, the prioritised action plan, and PDF and Word downloads for this audit.</DialogDescription>
        </DialogHeader>

        {loadError ? <p className="ix-notice" role="alert">{loadError}</p> : !options ? (
          <p><LoaderCircle size={16} className="ix-spin" style={{ display: "inline", marginRight: 8 }} /> Loading…</p>
        ) : offline || !options.pricePkr ? (
          <div className="ix-notice">
            <p>Online payment is not switched on yet. Tell us you want this report and we will unlock it for you.</p>
            <Button className="ix-btn-primary" style={{ marginTop: 12 }} onClick={() => { onOpenChange(false); onContact(); }}>Contact Improvexus <ArrowRight size={16} /></Button>
          </div>
        ) : claimed ? (
          <div className="success-message" role="status">
            <span className="success-icon"><Check size={27} /></span>
            <h3>Thank you. We&apos;re checking your payment.</h3>
            <p>As soon as it arrives your report unlocks. Reload this page to see it. Your reference is <b>{manual?.reference}</b>.</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Reload now</Button>
          </div>
        ) : manual && options.manual ? (
          <div className="ix-field" style={{ display: "grid", gap: 12 }}>
            <p><b>{rs(manual.amountPkr)}</b> to unlock this report. Use this reference so we can match your payment:</p>
            <p style={{ display: "flex", gap: 8, alignItems: "center" }}><code style={{ fontSize: 16, letterSpacing: 1 }}>{manual.reference}</code>
              <Button variant="outline" size="sm" onClick={() => void copy(manual.reference)}><Copy size={14} /> Copy</Button></p>
            {options.manual.text && <p style={{ whiteSpace: "pre-line" }}>{options.manual.text}</p>}
            {options.manual.link && <a className="ix-btn-primary" style={{ display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "center", padding: "10px 14px" }} href={options.manual.link} target="_blank" rel="noopener noreferrer">Open payment link <ExternalLink size={15} /></a>}
            <label>After you have paid, add the account or transaction number you sent from <span style={{ opacity: 0.7 }}>(optional)</span>
              <Textarea value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="e.g. Sent from 0300 1234567, transaction 8812345" />
            </label>
            <Button className="ix-btn-primary" disabled={busy === "claim"} onClick={() => void claim()}>{busy === "claim" ? "Sending…" : "I've paid"}</Button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ fontSize: 22 }}><b>{rs(options.pricePkr)}</b> <small style={{ opacity: 0.7 }}>one report, yours to keep</small></p>
            {options.sandbox && options.jazzcash && <p className="ix-notice" role="note">Test mode: payments are simulated and no money moves.</p>}
            {options.jazzcash && (
              <Button className="ix-btn-primary" disabled={!!busy} onClick={() => void start("jazzcash")}>
                {busy === "jazzcash" ? <LoaderCircle size={16} className="ix-spin" /> : <CreditCard size={16} />} Pay with JazzCash or card
              </Button>
            )}
            {options.manual && (
              <Button variant="outline" className="ix-btn-secondary" disabled={!!busy} onClick={() => void start("manual")}>
                {busy === "manual" ? <LoaderCircle size={16} className="ix-spin" /> : <Banknote size={16} />} Pay by NayaPay or bank transfer
              </Button>
            )}
            <p style={{ fontSize: 12.5, opacity: 0.7 }}><Lock size={12} style={{ display: "inline", marginRight: 4 }} />Card and wallet details are entered on JazzCash&apos;s page. Improvexus never sees them.</p>
          </div>
        )}

        {checkout && (
          <form ref={formRef} method="POST" action={checkout.url} style={{ display: "none" }}>
            {Object.entries(checkout.fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
