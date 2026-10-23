import { useColorScheme } from "react-native";

/**
 * The website's pitchside look (web/src/app/globals.css), so the app and the site feel like
 * one product: turf-tinted greys, a deep pitch green for top edges, and the site's green as
 * the accent. Dark mode is the pitch at night. The site's translucent borders and tints are
 * flattened over its card colour. Warnings use the site's amber.
 */
const light = {
  background: "#EDF0EB",
  card: "#FFFFFF",
  text: "#0E1A14",
  /** Secondary text (the site's muted-foreground). */
  muted: "#526058",
  /** Muted surfaces: score boxes, date tiles, secondary buttons and badges (the site's muted). */
  subtle: "#E2E7E1",
  border: "#D3DAD2",
  primary: "#0B6B3A",
  primaryText: "#FFFFFF",
  primarySoft: "#E7F0EB",
  /** Deep pitch green: the top edge of the header and of lead panels. */
  pitch: "#0D4A2C",
  pitchText: "#F2F7F3",
  danger: "#C42B2B",
  dangerSoft: "#F9EAEA",
  warn: "#7B3306",
  warnSoft: "#FFFBEB",
  warnBorder: "#FFD230",
  input: "#C3CCC2",
};

const dark: typeof light = {
  background: "#07110C",
  card: "#0E1A14",
  text: "#E6EFE9",
  muted: "#93A59B",
  subtle: "#162720",
  border: "#242F29",
  primary: "#3DD68C",
  primaryText: "#03140B",
  primarySoft: "#143122",
  pitch: "#0B3A23",
  pitchText: "#F2F7F3",
  danger: "#F06C6C",
  dangerSoft: "#3B2A26",
  warn: "#FEE685",
  warnSoft: "#262712",
  warnBorder: "#6E4D0C",
  input: "#323C37",
};

export type Colors = typeof light;

/** The app's colours, following the phone's light or dark setting. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

/**
 * The website's type, embedded in the app (assets/fonts, registered in app.config.ts). The site
 * uses Archivo's width axis, which React Native can't set, so each width is its own static cut:
 * FONT for text (400 to 700), and the rest at 800 only.
 */
export const FONT = "Archivo";
/** Scores, condensed and heavy like a scoreboard's (the site's font-score). */
export const FONT_SCORE = "ArchivoScore";
/** Section titles, condensed capitals like a matchday programme's (the site's section-title). */
export const FONT_SECTION = "ArchivoSection";
/** Page titles, which run wide (the site's h1). */
export const FONT_TITLE = "ArchivoTitle";
/** Match-clock times (500 and 600). */
export const FONT_MONO = "JetBrainsMono";

export const CARD_COLOURS = { green: "#2E9E44", yellow: "#F2C230", red: "#D93A2B" } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** The site's radius scale: --radius is 6px, square-ish corners. */
export const radius = { sm: 4, md: 5, lg: 6, xl: 8 } as const;
