// Time-zone arithmetic for the location pages, using the runtime's own IANA database (Intl) so
// daylight-saving changes are handled without a hand-maintained offset table.

/** Minutes east of UTC for `timeZone` at `at`. */
export function utcOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60), m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** "9:00 am" in `fromZone` expressed as a wall-clock time in `toZone`, with a day marker. */
export function convertWallClock(hour: number, fromZone: string, toZone: string, at: Date): { label: string; hour: number; dayShift: -1 | 0 | 1 } {
  const diff = utcOffsetMinutes(toZone, at) - utcOffsetMinutes(fromZone, at);
  let total = hour * 60 + diff;
  let dayShift: -1 | 0 | 1 = 0;
  if (total < 0) { total += 1440; dayShift = -1; }
  else if (total >= 1440) { total -= 1440; dayShift = 1; }
  const h = Math.floor(total / 60), m = total % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { label: `${h12}:${String(m).padStart(2, "0")} ${suffix}`, hour: h, dayShift };
}

/** "5 hours ahead of" / "9½ hours behind" / "half an hour behind" / "the same time as". */
export function describeDifference(zone: string, relativeTo: string, at: Date): string {
  const diff = utcOffsetMinutes(zone, at) - utcOffsetMinutes(relativeTo, at);
  if (diff === 0) return "the same time as";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60), m = abs % 60;
  const direction = diff > 0 ? "ahead of" : "behind";
  // Under an hour reads as words, not as "0½ hours" (Pakistan and India are 30 minutes apart).
  if (h === 0) return `${m === 30 ? "half an hour" : `${m} minutes`} ${direction}`;
  const amount = m === 30 ? `${h}½` : m === 45 ? `${h}¾` : m === 15 ? `${h}¼` : `${h}`;
  const unit = h === 1 && m === 0 ? "hour" : "hours";
  return `${amount} ${unit} ${direction}`;
}

export type Daypart = "early morning" | "working day" | "evening" | "night";
export function daypart(hour: number): Daypart {
  if (hour >= 5 && hour < 9) return "early morning";
  if (hour >= 9 && hour < 17) return "working day";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}
