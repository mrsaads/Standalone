// The metric vocabulary for weekly management reports, and the rules for displaying and comparing
// them.
//
// The single most important rule in this file: a metric that nobody entered is NULL, and NULL
// renders as "Not provided" — never as 0. Zero is a real measurement ("you sent no proposals this
// week") and showing it in place of missing data would be inventing a result. Every function below
// preserves that distinction rather than coalescing it away.

export type MetricKey =
  | "profile_views"
  | "invitations"
  | "proposals_sent"
  | "replies"
  | "interviews"
  | "hires"
  | "earnings"
  | "connects_spent";

export type MetricFormat = "integer" | "currency" | "decimal";

export const METRIC_KEYS: MetricKey[] = [
  "profile_views", "invitations", "proposals_sent", "replies",
  "interviews", "hires", "earnings", "connects_spent",
];

export const METRIC_META: Record<MetricKey, { label: string; format: MetricFormat; hint: string }> = {
  profile_views:   { label: "Profile views",   format: "integer",  hint: "How many people viewed the profile in this period." },
  invitations:     { label: "Invitations",     format: "integer",  hint: "Interview or job invitations received." },
  proposals_sent:  { label: "Proposals sent",  format: "integer",  hint: "Proposals submitted on the client's behalf." },
  replies:         { label: "Replies",         format: "integer",  hint: "Proposals that got a response." },
  interviews:      { label: "Interviews",      format: "integer",  hint: "Conversations that reached interview stage." },
  hires:           { label: "Hires",           format: "integer",  hint: "Contracts started." },
  earnings:        { label: "Earnings",        format: "currency", hint: "Earnings recorded in this period." },
  connects_spent:  { label: "Connects spent",  format: "integer",  hint: "Upwork Connects used on proposals." },
};

// Where a number came from. Stored per metric because different metrics on one report can honestly
// come from different places, and a reader is entitled to know which is which.
export type MetricSource = "admin_entered" | "upwork_export" | "screenshot" | "other";

export const SOURCE_LABEL: Record<MetricSource, string> = {
  admin_entered: "Entered by the Improvexus team",
  upwork_export: "From an Upwork export",
  screenshot: "From a screenshot on this report",
  other: "Other source",
};

export function isMetricKey(value: unknown): value is MetricKey {
  return typeof value === "string" && (METRIC_KEYS as string[]).includes(value);
}

export const NOT_PROVIDED = "Not provided";

// Format one value for display. `null` and `undefined` both mean "nobody entered this".
export function formatMetric(value: number | null | undefined, format: MetricFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NOT_PROVIDED;
  if (format === "currency") {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
  }
  if (format === "decimal") return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export type Comparison =
  // Both periods have a real number and a percentage is meaningful.
  | { kind: "percent"; direction: "up" | "down" | "flat"; percent: number; label: string }
  // Both have real numbers but the previous one was 0, so a percentage would be a division by
  // zero. Reported as an absolute change instead — "0 to 4" is honest; "+∞%" is not.
  | { kind: "absolute"; direction: "up" | "down" | "flat"; delta: number; label: string }
  // One side is missing. No comparison is shown at all, rather than a made-up baseline.
  | { kind: "incomparable"; label: string };

// Compare this period against the previous one.
//
// Three cases are handled explicitly, and the reason each exists is a way this commonly goes wrong:
//   1. Either value missing  -> no comparison. Treating a missing previous value as 0 would
//      manufacture a "+100%" out of nothing.
//   2. Previous value is 0   -> absolute change, never a percentage. (n - 0) / 0 is Infinity, and
//      rendering "Infinity%" or silently dropping the row are both worse than saying "0 → 4".
//   3. Both real and previous non-zero -> an ordinary percentage.
export function compareMetric(current: number | null | undefined, previous: number | null | undefined): Comparison {
  const haveCurrent = current !== null && current !== undefined && !Number.isNaN(current);
  const havePrevious = previous !== null && previous !== undefined && !Number.isNaN(previous);

  if (!haveCurrent || !havePrevious) {
    return { kind: "incomparable", label: "No comparable data for the previous period" };
  }

  const delta = (current as number) - (previous as number);
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  if (previous === 0) {
    return {
      kind: "absolute",
      direction,
      delta,
      label: delta === 0 ? "No change from 0" : `${previous} → ${current}`,
    };
  }

  const percent = (delta / Math.abs(previous as number)) * 100;
  return {
    kind: "percent",
    direction,
    percent,
    label: `${delta > 0 ? "+" : ""}${percent.toFixed(percent % 1 === 0 ? 0 : 1)}%`,
  };
}

// Turn the stored rows into a display list covering every metric in the vocabulary, so a report
// shows the full set with "Not provided" against the ones nobody filled in — rather than silently
// omitting them, which would leave the reader unable to tell "zero" from "we didn't measure it".
export function buildMetricRows(
  stored: { metricKey: string; value: number | null; source: string; periodStart: string | null; periodEnd: string | null; note: string }[],
  previous?: { metricKey: string; value: number | null }[],
) {
  const byKey = new Map(stored.map(row => [row.metricKey, row]));
  const prevByKey = new Map((previous ?? []).map(row => [row.metricKey, row.value]));
  return METRIC_KEYS.map(key => {
    const row = byKey.get(key);
    const meta = METRIC_META[key];
    const value = row?.value ?? null;
    return {
      key,
      label: meta.label,
      hint: meta.hint,
      value,
      display: formatMetric(value, meta.format),
      provided: value !== null,
      source: (row?.source as MetricSource | undefined) ?? null,
      sourceLabel: row?.source ? SOURCE_LABEL[(row.source as MetricSource)] ?? SOURCE_LABEL.other : null,
      periodStart: row?.periodStart ?? null,
      periodEnd: row?.periodEnd ?? null,
      note: row?.note ?? "",
      comparison: compareMetric(value, prevByKey.get(key) ?? null),
    };
  });
}
