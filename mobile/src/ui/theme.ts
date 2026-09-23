import { useColorScheme } from "react-native";

const light = {
  background: "#F5F6F5",
  card: "#FFFFFF",
  text: "#141A16",
  muted: "#667069",
  border: "#E2E6E3",
  primary: "#1F6F43",
  primaryText: "#FFFFFF",
  primarySoft: "#E3F1E8",
  danger: "#B42318",
  dangerSoft: "#FDECEA",
  warn: "#8A5A00",
  warnSoft: "#FFF4D6",
  input: "#FFFFFF",
};

const dark: typeof light = {
  background: "#0F1311",
  card: "#181D1A",
  text: "#E8EDE9",
  muted: "#9AA69E",
  border: "#2A332D",
  primary: "#5CC389",
  primaryText: "#0C140F",
  primarySoft: "#1D3326",
  danger: "#FF8A7A",
  dangerSoft: "#3A1C18",
  warn: "#F0C060",
  warnSoft: "#3A2F14",
  input: "#121614",
};

export type Colors = typeof light;

/** The app's colours, following the phone's light or dark setting. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export const CARD_COLOURS = { green: "#2E9E44", yellow: "#F2C230", red: "#D93A2B" } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;
