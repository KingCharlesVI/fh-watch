"use client";

import { Apple, Check, Send } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ACCESS_FORM, SITE } from "@/content";

/** Which test is being asked for. The two differ only in the account they need. */
export type AccessKind = "testflight" | "google-play";

const KINDS = {
  testflight: {
    title: "iPhone and Apple Watch",
    via: "TestFlight",
    icon: Apple,
    emailLabel: "The Apple ID your iPhone uses",
    emailHint: "TestFlight invitations go to this address, and only that Apple ID can accept one.",
    devicesLabel: "Your iPhone and watch",
    devicesPlaceholder: "e.g. iPhone 14, Apple Watch Series 9",
  },
  "google-play": {
    title: "Android and Wear OS",
    via: "Google Play",
    icon: null,
    emailLabel: "The Google account on your phone",
    emailHint: "Internal testing is tied to this account: the opt-in link only works when you're signed in with it.",
    devicesLabel: "Your phone and watch",
    devicesPlaceholder: "e.g. Pixel 8, Galaxy Watch 6",
  },
} as const;

type State = "idle" | "sending" | "sent" | "handedToEmail" | "failed";

/**
 * Asks to be let into one of the tests. There's no server behind this site, so the
 * form either posts to the endpoint in `ACCESS_FORM` or opens the umpire's email app
 * with everything filled in (see the comment on `ACCESS_FORM` in content.ts).
 */
export function AccessRequestForm({ kind }: { kind: AccessKind }) {
  const spec = KINDS[kind];
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [devices, setDevices] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<State>("idle");

  const heading = (
    <div className="flex items-center gap-2">
      {spec.icon && <spec.icon className="size-5 text-primary" aria-hidden="true" />}
      <h3 className="font-semibold">{spec.title}</h3>
      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{spec.via}</span>
    </div>
  );

  if (!ACCESS_FORM.endpoint && !SITE.contactEmail) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-5">
        {heading}
        <p className="mt-3 text-sm text-muted-foreground">
          Invitations aren&apos;t open through this form yet.{" "}
          <a href="/support" className="font-medium text-primary underline">
            Support
          </a>{" "}
          has the ways to get in touch in the meantime.
        </p>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = { kind, name: name.trim(), email: email.trim(), devices: devices.trim(), notes: notes.trim() };

    if (ACCESS_FORM.endpoint) {
      setState("sending");
      try {
        const res = await fetch(ACCESS_FORM.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(request),
        });
        setState(res.ok ? "sent" : "failed");
      } catch {
        setState("failed");
      }
      return;
    }

    // No endpoint: hand it to the umpire's email app, filled in and ready to send.
    const subject = `${SITE.name}: join the ${spec.via} test`;
    const body = [
      `Name: ${request.name}`,
      `${spec.emailLabel}: ${request.email}`,
      `${spec.devicesLabel}: ${request.devices}`,
      ...(request.notes ? ["", request.notes] : []),
    ].join("\n");
    window.location.href = `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setState("handedToEmail");
  }

  if (state === "sent" || state === "handedToEmail") {
    return (
      <div className="rounded-xl border bg-card p-5">
        {heading}
        <p className="mt-3 flex items-start gap-2 text-sm">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {state === "sent"
            ? "Thank you. You'll get the invitation by email, usually within a day or two."
            : "Your email app should have opened with everything filled in. Send it, and the invitation follows by email."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col rounded-xl border bg-card p-5">
      {heading}
      <div className="mt-4 flex flex-1 flex-col gap-4">
        <Field id={`${id}-name`} label="Your name" value={name} onChange={setName} autoComplete="name" maxLength={80} />
        <Field
          id={`${id}-email`}
          label={spec.emailLabel}
          hint={spec.emailHint}
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          maxLength={254}
        />
        <Field
          id={`${id}-devices`}
          label={spec.devicesLabel}
          placeholder={spec.devicesPlaceholder}
          value={devices}
          onChange={setDevices}
          maxLength={120}
        />
        <Field id={`${id}-notes`} label="Anything else (optional)" value={notes} onChange={setNotes} maxLength={500} required={false} textarea />
        {state === "failed" && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            That didn&apos;t send. Try again, or use the ways to get in touch on the{" "}
            <a href="/support" className="font-medium underline">
              support page
            </a>
            .
          </p>
        )}
        <button
          type="submit"
          disabled={state === "sending"}
          className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-60"
        >
          <Send className="size-4" aria-hidden="true" />
          {state === "sending" ? "Sending…" : `Ask to join the ${spec.via} test`}
        </button>
        <p className="text-xs text-muted-foreground">
          Used only to send you the invitation and to let you know about the test. Nothing else, and never passed on.
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  type = "text",
  required = true,
  textarea = false,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  const look = "w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none";
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {!required && <span className="sr-only"> (optional)</span>}
      </label>
      {textarea ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={look} {...rest} />
      ) : (
        <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} className={`h-10 ${look}`} {...rest} />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
