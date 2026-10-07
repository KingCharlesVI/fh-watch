import { FilterSelect } from "@/components/FilterSelect";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, apiOrNull } from "@/lib/api";
import type { Club, ClubWithTeams, Competition, Items, Venue } from "@/lib/types";

export type MatchFilterParams = { clubId?: string; teamId?: string; competition?: string; venue?: string };

export interface MatchFilters {
  /** For GET /v1/matches: only the filters that are set and make sense together. */
  query: MatchFilterParams;
  clubs: Club[] | null;
  teams: { id: string; name: string }[];
  competitions: Competition[];
  venues: Venue[];
}

const given = (v: string | undefined) => (v && v !== "any" ? v.trim() || undefined : undefined);

/**
 * The club, team, competition and venue filters from a page's search params, with what to
 * offer in each. With `clubId` the club is fixed (a club admin's own) and has no picker. A
 * team is only offered, and kept, once its club is picked: every club's teams would be too
 * many to pick from.
 */
export async function loadMatchFilters(sp: MatchFilterParams, fixed?: { clubId?: string }): Promise<MatchFilters> {
  const clubId = fixed?.clubId ?? given(sp.clubId);
  const [clubs, club, competitions, venues] = await Promise.all([
    fixed?.clubId ? null : api<Items<Club>>("/v1/clubs", { auth: false }),
    clubId ? apiOrNull<ClubWithTeams>(`/v1/clubs/${clubId}`, { auth: false }) : null,
    api<Items<Competition>>("/v1/competitions", { auth: false }),
    api<Items<Venue>>("/v1/venues", { auth: false }),
  ]);
  const teams = club?.teams ?? [];
  const teamId = given(sp.teamId);
  return {
    query: {
      clubId: club ? club.id : undefined,
      teamId: teams.some((t) => t.id === teamId) ? teamId : undefined,
      competition: given(sp.competition),
      venue: given(sp.venue),
    },
    clubs: clubs?.items ?? null,
    teams,
    competitions: competitions.items,
    venues: venues.items,
  };
}

/** The fields for a GET filter form. Competition and venue are typed or picked, and match any name containing them. */
export function MatchFilterFields({ filters }: { filters: MatchFilters }) {
  const { query, clubs, teams } = filters;
  return (
    <>
      {clubs && (
        <Field className="w-56">
          <FieldLabel>Club</FieldLabel>
          <FilterSelect
            name="clubId"
            defaultValue={query.clubId ?? "any"}
            options={[{ value: "any", label: "Any" }, ...clubs.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>
      )}
      {teams.length > 0 && (
        // Keyed by club, so picking another club starts the team at Any.
        <Field key={query.clubId} className="w-44">
          <FieldLabel>Team</FieldLabel>
          <FilterSelect
            name="teamId"
            defaultValue={query.teamId ?? "any"}
            options={[{ value: "any", label: "Any" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
          />
        </Field>
      )}
      <ListField name="competition" label="Competition" value={query.competition} options={filters.competitions} />
      <ListField name="venue" label="Venue" value={query.venue} options={filters.venues} />
    </>
  );
}

function ListField({ name, label, value, options }: { name: string; label: string; value?: string; options: { id: string; name: string }[] }) {
  return (
    <Field className="w-60">
      <FieldLabel htmlFor={`filter-${name}`}>{label}</FieldLabel>
      <Input id={`filter-${name}`} name={name} type="search" list={`filter-${name}-options`} defaultValue={value} placeholder="Any" autoComplete="off" />
      <datalist id={`filter-${name}-options`}>
        {options.map((o) => (
          <option key={o.id} value={o.name} />
        ))}
      </datalist>
    </Field>
  );
}
