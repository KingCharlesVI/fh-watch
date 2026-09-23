import type { FastifyBaseLogger } from "fastify";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSender {
  /** Sends the messages and returns tokens the push service says are no longer valid. */
  send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

/** Expo Push Service, which forwards to APNs and FCM. Sends in chunks of 100. */
export function expoPushSender(accessToken: string | undefined, log: FastifyBaseLogger): PushSender {
  return {
    async send(messages) {
      const invalidTokens: string[] = [];
      for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(chunk.map((m) => ({ ...m, sound: "default" }))),
        });
        if (!res.ok) {
          log.error({ status: res.status }, "Expo push request failed");
          continue;
        }
        const { data } = (await res.json()) as { data: ExpoTicket[] };
        data.forEach((ticket, j) => {
          if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            invalidTokens.push(chunk[j]!.to);
          }
        });
      }
      return { invalidTokens };
    },
  };
}

/** Development: write pushes to the log instead of sending them. */
export function logPushSender(log: FastifyBaseLogger): PushSender {
  return {
    async send(messages) {
      for (const m of messages) log.info({ push: m }, `Push to ${m.to}: ${m.title}`);
      return { invalidTokens: [] };
    },
  };
}

/** Tests: keep pushes in memory; tokens in `invalid` are reported back as invalid. */
export function memoryPushSender(): PushSender & { sent: PushMessage[]; invalid: Set<string> } {
  const sent: PushMessage[] = [];
  const invalid = new Set<string>();
  return {
    sent,
    invalid,
    async send(messages) {
      sent.push(...messages);
      return { invalidTokens: messages.map((m) => m.to).filter((t) => invalid.has(t)) };
    },
  };
}
