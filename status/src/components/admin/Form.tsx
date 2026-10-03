"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import type { Result } from "@/app/admin/actions";

/**
 * A form bound to one of the admin actions, showing what it said afterwards.
 * Plain HTML inside: it all works before any JavaScript arrives.
 */
export function Form({
  action,
  children,
  submit,
  className = "",
  variant = "primary",
}: {
  action: (state: Result | undefined, form: FormData) => Promise<Result>;
  children?: ReactNode;
  submit: string;
  className?: string;
  variant?: "primary" | "quiet";
}) {
  const [result, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className={className}>
      {children}
      <button type="submit" disabled={pending} className={variant === "primary" ? primary : quiet}>
        {pending ? "Working…" : submit}
      </button>
      {result?.error && (
        <p className="mt-2 text-sm text-bad" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && <p className="mt-2 text-sm text-ok">{result.ok}</p>}
    </form>
  );
}

const primary =
  "inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-60";
const quiet =
  "inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60";

export const FIELD = "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {children}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
