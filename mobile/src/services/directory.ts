import type { Suggestion } from "@/features/directory-field";
import { api } from "./index";

/**
 * What the type-or-pick fields offer (DirectoryField), from the website's lists: club
 * teams, and the venues and competitions admins keep.
 */

/** Club teams, named as the website names them: "Oxford Hawks M1". */
export const searchTeams = async (q: string): Promise<Suggestion[]> =>
  (await api.searchTeams(q)).items.map((t) => ({ id: t.id, value: `${t.club.name} ${t.name}` }));

/** Venues: "Banbury Road, Oxford". */
export const searchVenues = async (q: string): Promise<Suggestion[]> => (await api.searchVenues(q)).items.map((v) => ({ id: v.id, value: v.name }));

/** Competitions: "South League Premier". */
export const searchCompetitions = async (q: string): Promise<Suggestion[]> =>
  (await api.searchCompetitions(q)).items.map((c) => ({ id: c.id, value: c.name }));
