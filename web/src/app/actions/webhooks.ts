"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { type FormState, formError, optionalText, text } from "@/lib/forms";
import type { WebhookWithSecret } from "@/lib/types";

const PAGES = ["/dashboard/webhooks", "/admin/webhooks"];

async function attempt(call: () => Promise<FormState | void>, ok: string): Promise<FormState> {
  let state: FormState | void;
  try {
    state = await call();
  } catch (err) {
    return formError(err);
  }
  for (const p of PAGES) revalidatePath(p);
  return state ?? { ok };
}

/** `owner` is "club:<id>" or "competition:<id>". */
export async function createWebhook(_: FormState, fd: FormData): Promise<FormState> {
  const [kind, id] = text(fd, "owner").split(":");
  const format = text(fd, "format") || "json";
  return attempt(async () => {
    const created = await api<WebhookWithSecret>("/v1/webhooks", {
      method: "POST",
      body: { [kind === "competition" ? "competitionId" : "clubId"]: id, url: text(fd, "url"), format, description: optionalText(fd, "description") ?? null },
    });
    // Nothing checks a channel's messages, so its secret is no use to show.
    if (format !== "json") return { ok: "Added. Send a test to check it reaches the channel." };
    return { ok: "Added. Copy its secret now: it isn't shown again.", secret: created.secret };
  }, "Added.");
}

export async function setWebhookEnabled(_: FormState, fd: FormData): Promise<FormState> {
  const enabled = text(fd, "enabled") === "true";
  return attempt(() => api(`/v1/webhooks/${text(fd, "id")}`, { method: "PATCH", body: { enabled } }), enabled ? "Turned on." : "Turned off.");
}

export async function newWebhookSecret(_: FormState, fd: FormData): Promise<FormState> {
  return attempt(async () => {
    const renewed = await api<WebhookWithSecret>(`/v1/webhooks/${text(fd, "id")}/secret`, { method: "POST" });
    return { ok: "The old secret has stopped working. Copy the new one now: it isn't shown again.", secret: renewed.secret };
  }, "Done.");
}

export async function pingWebhook(_: FormState, fd: FormData): Promise<FormState> {
  return attempt(() => api(`/v1/webhooks/${text(fd, "id")}/ping`, { method: "POST" }), "A test goes within half a minute. Reload to see how it went.");
}

export async function deleteWebhook(_: FormState, fd: FormData): Promise<FormState> {
  return attempt(() => api(`/v1/webhooks/${text(fd, "id")}`, { method: "DELETE" }), "Deleted.");
}
