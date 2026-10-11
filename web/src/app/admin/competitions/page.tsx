import { UMPIRE_LEVELS } from "@fh/shared";
import { setCompetitionLevel } from "@/app/actions/umpiring";
import { ActionForm } from "@/components/ActionForm";
import { FilterSelect } from "@/components/FilterSelect";
import { NamedListAdmin } from "@/components/NamedListAdmin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import type { Competition, CompetitionUmpireLevel, Items } from "@/lib/types";

export const metadata = { title: "Competitions" };

const LEVEL_OPTIONS = [{ value: "none", label: "Any level" }, ...UMPIRE_LEVELS.map((l, i) => ({ value: String(i), label: `${l} or above` }))];

/** Leagues and cups: one list, offered to umpires editing a match, with the umpire level each asks for. */
export default async function AdminCompetitionsPage() {
  await requireAdmin("/admin/competitions");
  const [competitions, levels] = await Promise.all([
    api<Items<Competition>>("/v1/competitions"),
    api<Items<CompetitionUmpireLevel>>("/v1/competitions/umpire-levels"),
  ]);
  const levelOf = new Map(levels.items.map((l) => [l.competitionId, l.minLevel]));
  return (
    <NamedListAdmin
      list="competitions"
      title="Competitions"
      noun="competition"
      description="Offered when an umpire edits a match, where umpires can add one that's missing. A match keeps its competition as text, so changing this list never changes a match."
      example="South League Premier, or Hampshire Cup"
    >
      {competitions.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Umpire levels</CardTitle>
            <CardDescription>
              The lowest level a competition&apos;s fixtures ask for. When a club appoints umpires, anyone below it (or with no level recorded) is
              flagged, though they can still be asked.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {competitions.items.map((c) => (
              <ActionForm key={c.id} action={setCompetitionLevel} submitLabel="Save" variant="outline" inline>
                <input type="hidden" name="competitionId" value={c.id} />
                <span className="w-64 self-center truncate text-sm">{c.name}</span>
                <div className="w-48">
                  <FilterSelect name="minLevel" defaultValue={levelOf.has(c.id) ? String(levelOf.get(c.id)) : "none"} options={LEVEL_OPTIONS} />
                </div>
              </ActionForm>
            ))}
          </CardContent>
        </Card>
      )}
    </NamedListAdmin>
  );
}
