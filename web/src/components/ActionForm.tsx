"use client";

import { CircleAlert } from "lucide-react";
import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

interface Props {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  /** Asks in a dialog before submitting, for destructive actions. */
  confirm?: { title: string; description: string; action?: string };
  variant?: "default" | "outline" | "secondary" | "destructive";
  /** A one-line form (a button, or a field and a button). Success shows as a toast instead of below the form. */
  inline?: boolean;
  className?: string;
}

/** A form bound to a server action, showing its error, and its success message as an alert or a toast. */
export function ActionForm({ action, children, submitLabel, pendingLabel, confirm, variant = "default", inline, className }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [asking, setAsking] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);

  useEffect(() => {
    if (inline && state?.ok) toast.success(state.ok);
  }, [inline, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn(inline ? "inline-flex flex-wrap items-end gap-2" : "grid max-w-md gap-5", className)}
      onSubmit={(e) => {
        if (confirm && !confirmed.current) {
          e.preventDefault();
          setAsking(true);
        }
        confirmed.current = false;
      }}
    >
      {children}
      <div>
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? (pendingLabel ?? "Working…") : submitLabel}
        </Button>
      </div>
      {state?.error && (
        <Alert variant="destructive" className={cn(inline && "basis-full")}>
          <CircleAlert />
          <AlertTitle>{state.error}</AlertTitle>
          {state.details && (
            <AlertDescription>
              <ul className="list-disc pl-4">
                {state.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </AlertDescription>
          )}
        </Alert>
      )}
      {!inline && state?.ok && (
        <Alert>
          <AlertDescription className="text-foreground">{state.ok}</AlertDescription>
        </Alert>
      )}
      {confirm && (
        <AlertDialog open={asking} onOpenChange={setAsking}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant={variant === "destructive" ? "destructive" : "default"}
                onClick={() => {
                  confirmed.current = true;
                  formRef.current?.requestSubmit();
                }}
              >
                {confirm.action ?? submitLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </form>
  );
}
