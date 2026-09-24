"use client";
import { useState } from "react";
import Link from "next/link";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  managed_access_granted: "Access granted",
  weekly_report_published: "Weekly report",
  audit_completed: "Audit",
  action_required: "Action needed",
  announcement: "Announcement",
};

export function NotificationList({ initial, initialUnread }: { initial: NotificationItem[]; initialUnread: number }) {
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function mark(payload: { all: true } | { ids: string[] }) {
    setBusy(true);
    setError("");
    const stamp = new Date().toISOString();
    // Optimistic update, with the previous state kept so a failure can put it back rather than
    // leaving the list showing something the server never agreed to.
    const previousItems = items;
    const previousUnread = unread;
    const targeted = "all" in payload ? items.map(i => i.id) : payload.ids;
    setItems(list => list.map(i => (targeted.includes(i.id) && !i.readAt ? { ...i, readAt: stamp } : i)));
    setUnread(u => Math.max(0, u - targeted.filter(id => previousItems.find(i => i.id === id && !i.readAt)).length));
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; unread?: number };
      if (!response.ok) throw new Error(result.error || "Could not update notifications.");
      if (typeof result.unread === "number") setUnread(result.unread);
    } catch (cause) {
      setItems(previousItems);
      setUnread(previousUnread);
      setError(cause instanceof Error ? cause.message : "Could not update notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="ix-empty">
        <h3>Nothing here yet</h3>
        <p>
          You will be notified when a weekly report is published, when an audit finishes, when your
          managed-client access changes, and when something needs your input.
        </p>
      </div>
    );
  }

  return (
    <div className="ix-stack">
      <div className="ix-row" style={{ justifyContent: "space-between" }}>
        <span className="ix-muted-inline">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </span>
        {unread > 0 && (
          <button type="button" className="ix-btn ix-btn--quiet" onClick={() => mark({ all: true })} disabled={busy}>
            {busy ? "Marking…" : "Mark all as read"}
          </button>
        )}
      </div>

      {error && <p role="alert" className="ix-auth__error">{error}</p>}

      <div className="ix-list">
        {items.map(item => {
          const unreadItem = !item.readAt;
          const inner = (
            <>
              {unreadItem && <span className="ix-list__dot" aria-hidden="true" />}
              <div className="ix-list__main">
                <span className="ix-list__title">{item.title}</span>
                {item.body && <span className="ix-list__sub">{item.body}</span>}
                <span className="ix-list__sub">
                  {KIND_LABEL[item.kind] ?? "Update"} · {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
              {unreadItem && (
                <button
                  type="button"
                  className="ix-btn ix-btn--quiet"
                  disabled={busy}
                  onClick={event => { event.preventDefault(); void mark({ ids: [item.id] }); }}
                >
                  Mark read
                </button>
              )}
            </>
          );
          // A notification only becomes a link when the server gave it one; an empty link renders
          // as plain content rather than an anchor to nowhere.
          return item.link ? (
            <Link
              key={item.id}
              href={item.link}
              className={`ix-list__item${unreadItem ? " ix-list__item--unread" : ""}`}
              onClick={() => { if (unreadItem) void mark({ ids: [item.id] }); }}
            >
              {inner}
            </Link>
          ) : (
            <div key={item.id} className={`ix-list__item${unreadItem ? " ix-list__item--unread" : ""}`}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
