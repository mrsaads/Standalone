import type { ContentProfile } from "@/lib/upwork-mcp-client";
import type { ConnectedEvidence } from "@/lib/upwork-connected";

/** Keep MCP evidence to the five fields Improvexus promises to assess. */
export function contentProfileText(profile: ContentProfile): string {
  const lines = [
    "Assessment scope: title, overview, skills, portfolio, and certifications only.",
    profile.missing.length ? `Not returned by Upwork: ${profile.missing.join(", ")}. Do not infer or score those fields.` : "",
    `Title: ${profile.title || "not provided"}`,
    "", "Overview:", profile.overview || "not provided",
    "", `Skills: ${profile.skills.length ? profile.skills.join(", ") : "none listed"}`,
    "", "Portfolio:", ...(profile.portfolio.length ? profile.portfolio.map(item =>
      `- ${item.title}${item.role ? ` | Role: ${item.role}` : ""}${item.description ? ` | ${item.description}` : ""}${item.skills?.length ? ` | Skills: ${item.skills.join(", ")}` : ""}`
    ) : ["- none listed"]),
    "", "Certifications:", ...(profile.certifications.length ? profile.certifications.map(item =>
      `- ${item.name}${item.issuer ? ` | Issuer: ${item.issuer}` : ""}${item.description ? ` | ${item.description}` : ""}${item.url ? ` | ${item.url}` : ""}`
    ) : ["- none listed"]),
  ];
  return lines.filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n").slice(0, 40000);
}

export function mcpContentEvidence(profile: ContentProfile): ConnectedEvidence {
  return {
    v: 1,
    profileUrl: profile.profileUrl,
    overview: profile.overview,
    snapshot: {
      name: profile.name ?? null, title: profile.title || null, location: null,
      jss: null, badge: null, rating: null, reviews: null, totalJobs: null, totalHours: null,
      hourlyRate: null, consultation: null, unavailableSections: ["track", "offer"],
    },
    sections: { skills: profile.skills, employment: [], projects: profile.portfolio.map(item =>
      [item.title, item.role, item.description, item.skills?.join(", ")].filter(Boolean).join(" — ")) },
    missing: profile.missing,
    readAt: profile.readAt,
    contentProfile: profile,
  };
}
