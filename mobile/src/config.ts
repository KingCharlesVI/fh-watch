// Set in mobile/.env (development) or the build environment (releases). EXPO_PUBLIC_* is baked in at build time.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://fhmatchcentre.com").replace(/\/$/, "");
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "https://fhmatchcentre.com").replace(/\/$/, "");
