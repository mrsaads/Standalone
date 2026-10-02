import Link from "next/link";
import { SERVICES } from "@/lib/marketing/services";
import { CLIENT_MARKETS } from "@/lib/marketing/locations";
import { BUSINESS } from "@/lib/marketing/site";
import { convertWallClock, daypart, describeDifference, formatUtcOffset, utcOffsetMinutes, type Daypart } from "@/lib/marketing/time";

// Pieces shared by the country and city pages. Everything time-related is computed from the IANA
// time-zone database at render time (the pages revalidate daily), so a daylight-saving change in
// New York or London is reflected without anyone editing a table.

/** A place name that ends in a full stop ("Washington, D.C.") must not produce ".." at the end of a sentence. */
export const tidy = (text: string) => text.replace(/\.\.(?=\s|$)/g, ".");

const DAY_NOTE: Record<-1 | 0 | 1, string> = { [-1]: " (previous day)", 0: "", 1: " (next day)" };

export function marketRows(tz: string, at: Date) {
  return CLIENT_MARKETS.map(market => {
    const start = convertWallClock(9, market.tz, tz, at);
    const end = convertWallClock(17, market.tz, tz, at);
    return { ...market, same: utcOffsetMinutes(market.tz, at) === utcOffsetMinutes(tz, at), start, end, part: daypart(start.hour) };
  });
}

export function MarketTable({ placeName, tz, at }: { placeName: string; tz: string; at: Date }) {
  const rows = marketRows(tz, at);
  return (
    <div className="ix-m-table-wrap" role="region" aria-label={`Client working hours in ${placeName} time`} tabIndex={0}>
      <table className="ix-m-table">
        <caption>All times are shown in {placeName} local time ({formatUtcOffset(utcOffsetMinutes(tz, at))}) and already allow for daylight saving in each market.</caption>
        <thead>
          <tr><th scope="col">Client market</th><th scope="col">Their 9:00 am is</th><th scope="col">Their 5:00 pm is</th><th scope="col">For you that is</th></tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <th scope="row">{row.label} <span style={{ fontWeight: 400, color: "var(--ix-l-muted-2)" }}>({row.city})</span></th>
              <td><b>{row.start.label}</b>{DAY_NOTE[row.start.dayShift]}</td>
              <td><b>{row.end.label}</b>{DAY_NOTE[row.end.dayShift]}</td>
              <td>{row.same ? "your own working day" : `the ${row.part}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PART_SENTENCE: Record<Daypart, string> = {
  "working day": "That falls inside your own working day, so timing is on your side. What decides the job is how good the proposal is.",
  "evening": "That's the evening, when most people are finishing for the day. The best jobs go up just when you're least likely to be watching.",
  "night": "That's the middle of the night. By the time you check the feed in the morning, those jobs already have a queue of proposals ahead of yours.",
  "early morning": "That's before most people have started work, so you usually miss the first hours of a new posting.",
};

/** A paragraph that is true for this place's clock and no other. */
export function timingParagraph(placeName: string, tz: string, at: Date): string {
  const east = marketRows(tz, at)[0];
  if (east.same) {
    return `${placeName} keeps the same hours as the US East Coast, where a large share of Upwork's clients post their jobs. You see new work as soon as it appears, and so does everyone else in North America. That makes it important to be one of the first proposals the client reads.`;
  }
  return `When clients on the US East Coast start work at 9:00 am, it is ${east.start.label} in ${placeName}${DAY_NOTE[east.start.dayShift]}. ${PART_SENTENCE[east.part]}`;
}

export function teamSentence(placeName: string, tz: string, at: Date): string {
  const difference = describeDifference(BUSINESS.timeZone, tz, at);
  return tidy(difference === "the same time as"
    ? `Our team works on Pakistan Standard Time, the same clock as ${placeName}.`
    : `Our team works on Pakistan Standard Time, which is ${difference} ${placeName}.`);
}

export function ServiceChips() {
  return (
    <ul className="ix-m-chips">
      {SERVICES.map(service => <li key={service.slug}><Link href={`/services/${service.slug}`}>{service.title}</Link></li>)}
    </ul>
  );
}

// What a dedicated bidder does, stated once and reused — the country and city pages add the
// place-specific detail around it rather than rewording this six different ways.
export const BIDDER_POINTS = [
  { title: "Picks the jobs first", body: "We agree a written targeting profile with you. It covers categories, your lowest budget, client history and warning signs, and it decides which jobs are worth your Connects." },
  { title: "Covers the hours you can't", body: "Someone watches the feed across the time zones your clients post in, so good jobs get an answer while they're still new." },
  { title: "Writes to the brief", body: "Each proposal opens with the client's problem and the piece of your past work that's closest to it. We don't paste templates." },
  { title: "Shows you the record", body: "We log every proposal, view, reply and interview and go through them with you each week. You see real counts." },
];
