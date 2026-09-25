import { useColorScheme } from "react-native";

/**
 * The website's look (web/src/app/globals.css: shadcn/ui's neutral palette with a
 * green primary), converted from its OKLCH values, so the app and the site feel
 * like one product. Warnings use the site's amber.
 */
const light = {
  background: "#FFFFFF",
  card: "#FFFFFF",
  text: "#0A0A0A",
  /** Secondary text (the site's muted-foreground). */
  muted: "#737373",
  /** Muted surfaces: tab bars, secondary buttons and badges (the site's muted). */
  subtle: "#F5F5F5",
  border: "#E5E5E5",
  primary: "#106C3E",
  primaryText: "#FAFAFA",
  primarySoft: "#E7F0EB",
  danger: "#E7000B",
  dangerSoft: "#FDE6E7",
  warn: "#7B3306",
  warnSoft: "#FFFBEB",
  warnBorder: "#FFD230",
  input: "#E5E5E5",
};

const dark: typeof light = {
  background: "#0A0A0A",
  card: "#171717",
  text: "#FAFAFA",
  muted: "#A1A1A1",
  subtle: "#262626",
  border: "#2E2E2E",
  primary: "#55C483",
  primaryText: "#0A1A10",
  primarySoft: "#132A1D",
  danger: "#FF6467",
  dangerSoft: "#2E1314",
  warn: "#FEE685",
  warnSoft: "#1F1A0B",
  warnBorder: "#5C4A12",
  input: "#3A3A3A",
};

export type Colors = typeof light;

/** The app's colours, following the phone's light or dark setting. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

/** Geist, the website's typeface, embedded in the app (assets/fonts, registered in app.config.ts). */
export const FONT = "Geist";

export const CARD_COLOURS = { green: "#2E9E44", yellow: "#F2C230", red: "#D93A2B" } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** The site's radius scale: --radius is 10px. */
export const radius = { sm: 6, md: 8, lg: 10, xl: 14 } as const;
