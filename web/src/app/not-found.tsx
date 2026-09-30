import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-7" />
      </span>
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">This page doesn&apos;t exist, or the match hasn&apos;t been published yet.</p>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button asChild>
          <Link href="/matches">See the latest results</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
