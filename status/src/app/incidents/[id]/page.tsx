import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IncidentItem } from "@/components/IncidentItem";
import { Container } from "@/components/ui";
import { incidentById } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { data: incident } = await incidentById((await params).id);
  return { title: incident?.title ?? "Incident" };
}

/** One incident on its own page, so a link to it means something. */
export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: incident, ok } = await incidentById((await params).id);
  if (ok && !incident) notFound();
  if (!incident) {
    return (
      <Container className="py-8">
        <p className="text-sm text-muted-foreground">This page can&apos;t reach its records just now. Try again in a minute.</p>
      </Container>
    );
  }

  return (
    <Container className="space-y-6 py-8">
      <a href="/history" className="text-sm text-muted-foreground no-underline hover:text-foreground">
        ← All history
      </a>
      <IncidentItem incident={incident} heading="h2" link={false} />
    </Container>
  );
}
