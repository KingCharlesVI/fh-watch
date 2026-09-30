import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="font-heading text-3xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">This page doesn&apos;t exist, or the match hasn&apos;t been published.</p>
      <Button asChild>
        <Link href="/matches">See the latest results</Link>
      </Button>
    </div>
  );
}
