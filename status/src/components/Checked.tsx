"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { showAgo } from "@/lib/site";

/** How often the page checks again on its own. */
const REFRESH_MS = 60_000;

/**
 * "checked just now", and a page that keeps itself up to date. Refreshing asks the
 * server to render again, which runs the checks again — so there's no second copy
 * of the board's logic in the browser.
 */
export function Checked({ at }: { at: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ago, setAgo] = useState(() => showAgo(new Date(at)));

  useEffect(() => {
    const checkedAt = new Date(at);
    const tick = setInterval(() => setAgo(showAgo(checkedAt)), 10_000);
    const refresh = setInterval(() => start(() => router.refresh()), REFRESH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [at, router]);

  return (
    <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
      <span aria-live="polite">{pending ? "checking…" : `checked ${ago}`}</span>
      <button
        type="button"
        onClick={() => start(() => router.refresh())}
        disabled={pending}
        className="rounded-md p-1 hover:bg-background/60 disabled:opacity-50"
        aria-label="Check again"
        title="Check again"
      >
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      </button>
    </span>
  );
}
