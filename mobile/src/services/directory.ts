import { canAddToLists } from "@fh/shared";
import type { ComponentProps } from "react";
import type { DirectoryField, Suggestion } from "@/features/directory-field";
import { useAuth } from "@/state/auth";
import { api } from "./index";

/**
 * What the type-or-pick fields offer (DirectoryField), from the website's lists: club
 * teams, and the venues and competitions umpires pick from and add to.
 */

/** Club teams, named as the website names them: "Oxford Hawks M1". */
export const searchTeams = async (q: string): Promise<Suggestion[]> =>
  (await api.searchTeams(q)).items.map((t) => ({ id: t.id, value: `${t.club.name} ${t.name}` }));

/** Venues: "Banbury Road, Oxford". */
export const searchVenues = async (q: string): Promise<Suggestion[]> => (await api.searchVenues(q)).items.map((v) => ({ id: v.id, value: v.name }));

/** Competitions: "South League Premier". */
export const searchCompetitions = async (q: string): Promise<Suggestion[]> =>
  (await api.searchCompetitions(q)).items.map((c) => ({ id: c.id, value: c.name }));

type Add = ComponentProps<typeof DirectoryField>["add"];

/** Adding a missing venue or competition from the field: for a signed-in umpire (or admin) only. */
export function useListAdders(): { venue: Add; competition: Add } {
  const { user } = useAuth();
  if (!canAddToLists(user)) return { venue: undefined, competition: undefined };
  return {
    venue: { noun: "venue", run: api.addVenue },
    competition: { noun: "competition", run: api.addCompetition },
  };
}
