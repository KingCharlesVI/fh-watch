import { PageHeader } from "@/components/PageHeader";
import { AddWebhook, WebhookCard } from "@/components/Webhooks";
import { api } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import type { Club, Competition, Items, Webhook, WebhookDelivery } from "@/lib/types";

export const metadata = { title: "Webhooks" };

/** Every webhook: clubs' (which their admins can manage too) and competitions' (admins only, e.g. for a league secretary). */
export default async function AdminWebhooksPage() {
  await requireAdmin("/admin/webhooks");
  const [hooks, clubs, competitions] = await Promise.all([
    api<Items<Webhook>>("/v1/webhooks"),
    api<Items<Club>>("/v1/clubs"),
    api<Items<Competition>>("/v1/competitions"),
  ]);
  const deliveries = await Promise.all(hooks.items.map((w) => api<Items<WebhookDelivery>>(`/v1/webhooks/${w.id}/deliveries`)));
  const clubName = new Map(clubs.items.map((c) => [c.id, c.name]));
  const competitionName = new Map(competitions.items.map((c) => [c.id, c.name]));
  const owner = (w: Webhook) => `For ${w.clubId ? (clubName.get(w.clubId) ?? "a club") : (competitionName.get(w.competitionId!) ?? "a competition")}`;
  const owners = [
    ...competitions.items.map((c) => ({ value: `competition:${c.id}`, label: `Competition: ${c.name}` })),
    ...clubs.items.map((c) => ({ value: `club:${c.id}`, label: `Club: ${c.name}` })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        back={{ href: "/admin", label: "Admin" }}
        description="Addresses told about a competition's or a club's published matches. Club admins manage their own club's from their dashboard."
      />
      {hooks.items.length === 0 && <p className="text-muted-foreground">No webhooks yet.</p>}
      {hooks.items.map((w, i) => (
        <WebhookCard key={w.id} webhook={w} deliveries={deliveries[i]!.items} owner={owner(w)} />
      ))}
      {owners.length > 0 && <AddWebhook owners={owners} />}
    </div>
  );
}
