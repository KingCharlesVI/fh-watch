import { PageHeader } from "@/components/PageHeader";
import { AddWebhook, WebhookCard } from "@/components/Webhooks";
import { api } from "@/lib/api";
import { requireClubAdmin } from "@/lib/session";
import type { Club, Items, Webhook, WebhookDelivery } from "@/lib/types";

export const metadata = { title: "Webhooks" };

/** A club's webhooks: addresses told about the matches its teams play. */
export default async function ClubWebhooksPage() {
  const user = await requireClubAdmin("/dashboard/webhooks");
  const [club, hooks] = await Promise.all([
    api<Club>(`/v1/clubs/${user.clubId}`),
    api<Items<Webhook>>("/v1/webhooks", { query: { clubId: user.clubId } }),
  ]);
  const deliveries = await Promise.all(hooks.items.map((w) => api<Items<WebhookDelivery>>(`/v1/webhooks/${w.id}/deliveries`)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description={`Send ${club.name}'s results to your own website or another system as soon as they're published.`}
      />
      {hooks.items.map((w, i) => (
        <WebhookCard key={w.id} webhook={w} deliveries={deliveries[i]!.items} />
      ))}
      {hooks.items.length < 5 && <AddWebhook owners={[{ value: `club:${club.id}`, label: club.name }]} />}
    </div>
  );
}
