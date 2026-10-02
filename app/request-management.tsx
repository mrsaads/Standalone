"use client";
import { useState } from "react";

// The "Request management services" action on the welcome dashboard.
//
// Submitting this records a lead and NOTHING ELSE. It does not create a workspace, does not create
// a membership, and does not change what this account can open — the success copy below says so
// explicitly rather than implying that access is now pending automatic approval. The server route
// (app/api/management-enquiries/route.ts) is where that guarantee actually lives.
export function RequestManagementButton({ alreadyRequested }: { alreadyRequested: boolean }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  if (sent || alreadyRequested) {
    return (
      <p role="status" className="ix-field-help">
        We have your request. An account manager will contact you. Enrolment is set up by hand, so
        nothing here unlocks until they do it.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="ix-btn ix-btn--secondary" onClick={() => setOpen(true)}>
        Request management services
      </button>
    );
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/management-enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "The request could not be sent.");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request could not be sent.");
      // Deliberately does not clear `message` — a failed submit must not lose what was typed.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ix-stack" style={{ width: "100%" }}>
      <div className="ix-field">
        <label htmlFor="ix-mgmt-msg">What would you like help with?</label>
        <textarea
          id="ix-mgmt-msg"
          className="ix-textarea"
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={1000}
          placeholder="Tell us about your profile and what you are trying to achieve."
        />
        <p className="ix-field-help">Optional. {1000 - message.length} characters left.</p>
      </div>
      {error && <p role="alert" className="ix-auth__error">{error}</p>}
      <div className="ix-row">
        <button type="button" className="ix-btn ix-btn--primary" onClick={submit} disabled={submitting}>
          {submitting ? "Sending…" : "Send request"}
        </button>
        <button type="button" className="ix-btn ix-btn--quiet" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
