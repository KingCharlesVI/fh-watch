/**
 * Setup on phone: a match set up on the phone and sent to the watch, which opens its
 * own setup screen with it to check and start. The fields, defaults and limits are the
 * watch's (Setup in watch-wear/.../data/Prefs.kt); the watch checks them again.
 */

/** Team colours: the same palette as the watch (TEAM_COLOURS in watch-wear/.../ui/Common.kt). */
export const TEAM_COLOURS = ["#DC2626", "#1D4ED8", "#FACC15", "#16A34A", "#EA580C", "#7C3AED", "#38BDF8", "#EC4899", "#111111", "#FFFFFF"];

export const COLOUR_NAMES: Record<string, string> = {
  "#DC2626": "Red",
  "#1D4ED8": "Blue",
  "#FACC15": "Yellow",
  "#16A34A": "Green",
  "#EA580C": "Orange",
  "#7C3AED": "Purple",
  "#38BDF8": "Sky blue",
  "#EC4899": "Pink",
  "#111111": "Black",
  "#FFFFFF": "White",
};

export interface WatchSetup {
  periods: number;
  periodMinutes: number;
  /** Breaks between periods; with an even number of periods over 2, the middle one is half-time. */
  breakMinutes: number;
  halfTimeMinutes: number;
  shootoutIfDrawn: boolean;
  homeName: string;
  homeColor: string;
  homeCaptain: number | null;
  awayName: string;
  awayColor: string;
  awayCaptain: number | null;
  venue: string | null;
}

export const DEFAULT_SETUP: WatchSetup = {
  periods: 4,
  periodMinutes: 15,
  breakMinutes: 2,
  halfTimeMinutes: 5,
  shootoutIfDrawn: false,
  homeName: "Home",
  homeColor: "#1D4ED8",
  homeCaptain: null,
  awayName: "Away",
  awayColor: "#DC2626",
  awayCaptain: null,
  venue: null,
};

export interface Preset {
  label: string;
  periods: number;
  periodMinutes: number;
  breakMinutes: number;
  halfTimeMinutes: number;
}

/** The watch's presets (Setup.PRESETS). */
export const PRESETS: Preset[] = [
  { label: "4 × 15 min", periods: 4, periodMinutes: 15, breakMinutes: 2, halfTimeMinutes: 5 },
  { label: "2 × 35 min", periods: 2, periodMinutes: 35, breakMinutes: 5, halfTimeMinutes: 5 },
  { label: "2 × 30 min", periods: 2, periodMinutes: 30, breakMinutes: 5, halfTimeMinutes: 5 },
  { label: "2 × 25 min", periods: 2, periodMinutes: 25, breakMinutes: 5, halfTimeMinutes: 5 },
];

export const presetOf = (s: WatchSetup): Preset | undefined =>
  PRESETS.find((p) => p.periods === s.periods && p.periodMinutes === s.periodMinutes && p.breakMinutes === s.breakMinutes && p.halfTimeMinutes === s.halfTimeMinutes);

export const hasHalfTime = (periods: number) => periods % 2 === 0 && periods > 2;

/** The limits the watch's setup screen allows. */
export const LIMITS = {
  periods: [1, 8],
  periodMinutes: [1, 90],
  breakMinutes: [0, 30],
  halfTimeMinutes: [0, 30],
  captain: [0, 99],
} as const;

type NumberField = "periods" | "periodMinutes" | "breakMinutes" | "halfTimeMinutes";

/** What's wrong with a setup, by field; empty when it's ready to send. */
export function setupErrors(s: WatchSetup): Partial<Record<keyof WatchSetup, string>> {
  const errors: Partial<Record<keyof WatchSetup, string>> = {};
  const range = (field: NumberField, [min, max]: readonly [number, number]) => {
    const v = s[field];
    if (!Number.isInteger(v) || v < min || v > max) errors[field] = `${min} to ${max}`;
  };
  range("periods", LIMITS.periods);
  range("periodMinutes", LIMITS.periodMinutes);
  if (s.periods > 1) range("breakMinutes", LIMITS.breakMinutes);
  if (hasHalfTime(s.periods)) range("halfTimeMinutes", LIMITS.halfTimeMinutes);
  for (const side of ["home", "away"] as const) {
    const captain = s[`${side}Captain`];
    if (captain != null && (!Number.isInteger(captain) || captain < 0 || captain > 99)) errors[`${side}Captain`] = "A shirt number, 0 to 99";
    if (!s[`${side}Name`].trim()) errors[`${side}Name`] = "Give the team a name";
  }
  return errors;
}

/** The message the watch reads (Setup.fromPhone): trimmed, with an empty venue left out. */
export function setupMessage(s: WatchSetup): string {
  return JSON.stringify({
    ...s,
    homeName: s.homeName.trim().slice(0, 80),
    awayName: s.awayName.trim().slice(0, 80),
    venue: s.venue?.trim().slice(0, 120) || null,
  });
}

/** A setup saved earlier (the last one sent), or the defaults if there isn't a readable one. */
export function readSavedSetup(saved: string | null | undefined): WatchSetup {
  if (!saved) return DEFAULT_SETUP;
  try {
    const parsed = JSON.parse(saved) as Partial<WatchSetup>;
    return { ...DEFAULT_SETUP, ...parsed };
  } catch {
    return DEFAULT_SETUP;
  }
}
