/** Where this page lives and what it points at. */
export const SITE = {
  name: "FH Match Centre",
  url: process.env.STATUS_URL ?? "https://status.fhmatchcentre.com",
  landingUrl: "https://fhmatchcentre.com",
  appUrl: "https://app.fhmatchcentre.com",
  /** Shown in the footer, so nobody wonders which clock the times are on. */
  timeZoneLabel: "UK time",
  timeZone: "Europe/London",
};

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: SITE.timeZone,
});

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: SITE.timeZone });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: SITE.timeZone });

export const showDateTime = (d: Date) => dateTime.format(d);
export const showDate = (d: Date) => date.format(d);
export const showTime = (d: Date) => time.format(d);

/** "45 minutes", "2 hours 10 minutes": how long something lasted. */
export function showDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest ? `${h} ${rest} minute${rest === 1 ? "" : "s"}` : h;
}

/** "just now", "3 minutes ago": for the live check. */
export function showAgo(from: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
