import type { Fixture } from "./types";

/** How many more umpires a fixture needs: those who've accepted count, those asked don't yet. */
export function shortOf(f: Fixture): number {
  return f.umpiresNeeded - f.appointments.filter((a) => a.status === "accepted").length;
}

/** The roles nobody holds yet (asked or accepted), while the fixture has room for more. */
export function openRoles(f: Fixture): ("watch" | "second")[] {
  const active = f.appointments.filter((a) => a.status === "offered" || a.status === "accepted");
  if (active.length >= f.umpiresNeeded) return [];
  return (["watch", "second"] as const).filter((r) => !active.some((a) => a.role === r));
}
