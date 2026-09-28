"use client";
import { Bell, Briefcase, FileSearch, Inbox, Sparkles, type LucideIcon } from "lucide-react";
import type { AdminOverview } from "@/lib/admin-stats";
import { StatCard, Stats, Tile, Tiles, type TileFact } from "../ui-kit";

// The overview: five headline numbers, then five tiles.
//
// A tile answers three questions without being clicked — what this area is, whether anything is
// waiting, and the two or three numbers that describe its current state. If you have to open a tile
// to find out there was nothing to do in it, the overview has failed at its only job.
//
// Ordered by urgency, not by alphabet or by how much code sits behind each one: the things a person
// is waiting on come first, the reference areas last.

type TileSpec = {
  href: string;
  label: string;
  icon: LucideIcon;
  body: string;
  /** > 0 renders the filled accent pill. */
  attention: number;
  attentionLabel: string;
  /** Shown when nothing is waiting — a calm statement of the steady state, not a blank space. */
  restingLabel: string;
  facts: TileFact[];
};

export function AdminOverviewTiles({ overview: o }: { overview: AdminOverview }) {
  const enquiriesWaiting = o.leadsNew + o.managementNew;
  const outstanding = enquiriesWaiting + o.optimizationOpen;

  const tiles: TileSpec[] = [
    {
      href: "/admin/enquiries",
      label: "Enquiries",
      icon: Inbox,
      body: "Everything submitted from the website and from the dashboard's \"Request management\" button.",
      attention: enquiriesWaiting,
      attentionLabel: `${enquiriesWaiting} new`,
      restingLabel: "All handled",
      facts: [
        { value: o.leadsTotal, label: "Website" },
        { value: o.managementTotal, label: "Management" },
        { value: o.leadsNew, label: "Unread" },
      ],
    },
    {
      href: "/admin/requests",
      label: "Optimization requests",
      icon: Sparkles,
      body: "The \"request optimization by a person\" queue from a report's Optimization tab.",
      attention: o.optimizationOpen,
      attentionLabel: `${o.optimizationOpen} open`,
      restingLabel: "Queue clear",
      facts: [
        { value: o.optimizationTotal, label: "All time" },
        { value: o.optimizationOpen, label: "Open" },
        { value: o.optimizationTotal - o.optimizationOpen, label: "Done" },
      ],
    },
    {
      href: "/admin/clients",
      label: "Client portals",
      icon: Briefcase,
      body: "Managed clients: portal access, their Upwork profiles, and their weekly reports.",
      // A draft report is work in progress, not an alert — so it is shown as a fact, and only a
      // suspended client (access withdrawn, someone should know why) raises the pill.
      attention: o.suspendedWorkspaces,
      attentionLabel: `${o.suspendedWorkspaces} suspended`,
      restingLabel: o.workspaces === 0 ? "No clients yet" : "All active",
      facts: [
        { value: o.activeWorkspaces, label: "Clients" },
        { value: o.managedMembers, label: "With access" },
        { value: o.reportsDraft, label: "Drafts" },
      ],
    },
    {
      href: "/admin/notifications",
      label: "Notifications",
      icon: Bell,
      body: "Send an in-app message to everyone, to an audience, or to one person by email.",
      attention: 0,
      attentionLabel: "",
      restingLabel: o.lastAnnouncementAt
        ? `Last sent ${new Date(o.lastAnnouncementAt).toLocaleDateString()}`
        : "Nothing sent yet",
      facts: [
        { value: o.announcementsSent, label: "Sent" },
        { value: o.announcementRecipients, label: "Delivered" },
        { value: o.notificationsUnread, label: "Unread" },
      ],
    },
    {
      href: "/admin/accounts",
      label: "Audits & memberships",
      icon: FileSearch,
      body: "Every account, its audit plan and credits, and every audit the product has generated.",
      attention: o.auditsStuck,
      attentionLabel: `${o.auditsStuck} stuck`,
      restingLabel: `${o.audits7Days} completed this week`,
      facts: [
        { value: o.users, label: "Accounts" },
        { value: o.paidUsers, label: "Paid" },
        { value: o.auditsTotal, label: "Audits" },
      ],
    },
  ];

  return (
    <>
      <Stats>
        <StatCard label="Accounts" value={o.users} note={`${o.verifiedUsers} verified`} />
        <StatCard label="Paid plans" value={o.paidUsers} note={`${o.activeLast7Days} active this week`} />
        <StatCard label="Managed clients" value={o.activeWorkspaces} note={`${o.managedMembers} with portal access`} />
        <StatCard
          label="Audits"
          value={o.auditsTotal}
          note={o.auditsCompleted === 0 && o.auditsTotal > 0 ? `${o.auditsFailed} failed, none completed` : `${o.auditsCompleted} completed`}
          tone={o.auditsCompleted === 0 && o.auditsTotal > 0 ? "attention" : undefined}
        />
        <StatCard
          label="Waiting on you"
          value={outstanding}
          note={outstanding === 0 ? "Nothing outstanding" : "Enquiries and requests"}
          tone={outstanding > 0 ? "attention" : undefined}
        />
      </Stats>

      <div style={{ marginTop: "var(--ix-gap-xl)" }}>
        <Tiles>
          {tiles.map(tile => {
            const Icon = tile.icon;
            return (
              <Tile
                key={tile.href}
                href={tile.href}
                icon={<Icon size={20} aria-hidden="true" />}
                title={tile.label}
                body={tile.body}
                badge={tile.attention > 0 ? tile.attentionLabel : tile.restingLabel}
                badgeTone={tile.attention > 0 ? "attn" : "quiet"}
                facts={tile.facts}
              />
            );
          })}
        </Tiles>
      </div>
    </>
  );
}
