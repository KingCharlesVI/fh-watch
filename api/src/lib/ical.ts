/**
 * Just enough iCalendar (RFC 5545) for an umpire's appointments: events at local UK times,
 * or all-day when there's no kick-off yet.
 */

export interface CalendarEvent {
  uid: string;
  /** "2026-09-26". */
  date: string;
  /** Local kick-off, "14:00", or null for an all-day event. */
  time: string | null;
  durationMinutes: number;
  summary: string;
  location: string | null;
  description: string | null;
}

const TZID = "Europe/London";

/** The UK's rules since 1996: BST from the last Sunday in March to the last Sunday in October. */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0000",
  "TZOFFSETTO:+0100",
  "TZNAME:BST",
  "DTSTART:19700329T010000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0000",
  "TZNAME:GMT",
  "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Text with the characters iCalendar treats specially escaped. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Long lines folded at 75 octets, continuing with a space, as the format requires. */
export function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    // Don't split a character: back up past UTF-8 continuation bytes.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

const compactDay = (day: string) => day.replaceAll("-", "");

function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
}

/** The local end of an event, "20260926T160000", kept within the day. */
function localEnd(day: string, time: string, minutes: number): string {
  const total = Math.min(Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes, 23 * 60 + 59);
  return `${compactDay(day)}T${String(Math.floor(total / 60)).padStart(2, "0")}${String(total % 60).padStart(2, "0")}00`;
}

export function calendar(name: string, events: CalendarEvent[], now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FH Match Centre//Appointments//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escapeText(name)}`, ...VTIMEZONE];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.time) {
      lines.push(`DTSTART;TZID=${TZID}:${compactDay(e.date)}T${e.time.replace(":", "")}00`, `DTEND;TZID=${TZID}:${localEnd(e.date, e.time, e.durationMinutes)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDay(e.date)}`, `DTEND;VALUE=DATE:${compactDay(nextDay(e.date))}`);
    }
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
