import type { Match, WebhookEvent, WebhookFormat } from "@fh/shared";

export type ChatFormat = Exclude<WebhookFormat, "json">;

/** What a message says, before it's put in a platform's shape. */
interface Message {
  title: string;
  details: string;
  /** The public match page; null once the match isn't public. */
  link: string | null;
  colour: number;
}

const playedOn = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });

const HEADINGS: Record<Exclude<WebhookEvent, "ping">, { heading: string; colour: number; public: boolean }> = {
  "match.published": { heading: "Result", colour: 0x2e7d32, public: true },
  "match.updated": { heading: "Result corrected", colour: 0xf9a825, public: true },
  "match.unpublished": { heading: "Result withdrawn", colour: 0x757575, public: false },
  "match.deleted": { heading: "Result removed", colour: 0x757575, public: false },
};

function score(m: Match): string {
  const shootout = m.home.shootout !== null && m.away.shootout !== null ? ` (${m.home.shootout}–${m.away.shootout} in the shootout)` : "";
  return `${m.home.name} ${m.home.score}–${m.away.score} ${m.away.name}${shootout}`;
}

/** The result, the competition, the day and the venue. Never the umpires: the channel may be anyone's. */
function describe(event: WebhookEvent, match: Match | null): Message {
  if (event === "ping" || !match) {
    return { title: "Test from FH Match Centre", details: "Results will be posted here as soon as they're published.", link: null, colour: 0x1565c0 };
  }
  const { heading, colour, public: isPublic } = HEADINGS[event];
  return {
    title: `${heading}: ${score(match)}`,
    details: [match.competition, playedOn.format(new Date(match.playedAt)), match.venue].filter(Boolean).join(" · "),
    link: isPublic ? match.shareUrl : null,
    colour,
  };
}

/** Slack's mrkdwn treats only these as special; the rest is shown as typed. */
const slackText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Discord's markdown, so a team called *Stars* isn't shown in italics. */
const discordText = (s: string) => s.replace(/[\\*_~`|>[\]]/g, "\\$&");

/**
 * A chat message about a match event, as the body the platform's incoming webhook expects:
 * Slack's `text`, a Discord embed, or a Teams (Workflows) Adaptive Card.
 */
export function chatMessage(format: ChatFormat, event: WebhookEvent, match: Match | null): object {
  const m = describe(event, match);
  switch (format) {
    case "slack":
      return { text: [`*${slackText(m.title)}*`, slackText(m.details), m.link && `<${m.link}|Match report>`].filter(Boolean).join("\n") };
    case "discord":
      return {
        username: "FH Match Centre",
        // No @everyone or @someone from a team's name.
        allowed_mentions: { parse: [] },
        embeds: [{ title: discordText(m.title).slice(0, 256), description: discordText(m.details) || undefined, url: m.link ?? undefined, color: m.colour }],
      };
    case "teams":
      return {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            contentUrl: null,
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.4",
              body: [
                { type: "TextBlock", text: m.title, weight: "Bolder", size: "Medium", wrap: true },
                ...(m.details ? [{ type: "TextBlock", text: m.details, isSubtle: true, wrap: true, spacing: "None" }] : []),
              ],
              actions: m.link ? [{ type: "Action.OpenUrl", title: "Match report", url: m.link }] : [],
            },
          },
        ],
      };
  }
}

/** Where each platform's incoming webhooks live, so an address pasted under the wrong one is caught when it's added. */
const CHAT_HOSTS: { format: ChatFormat; name: string; host: RegExp }[] = [
  { format: "slack", name: "Slack", host: /^hooks\.slack\.com$/ },
  { format: "discord", name: "Discord", host: /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/ },
];

/** Why an address won't do for a format, or null if it might. Teams' Workflows addresses vary too much to check. */
export function chatHostProblem(format: WebhookFormat, hostname: string): string | null {
  const known = CHAT_HOSTS.find((c) => c.host.test(hostname));
  if (format === "json") return known ? `That's a ${known.name} address: choose ${known.name} instead.` : null;
  const wanted = CHAT_HOSTS.find((c) => c.format === format);
  if (wanted && !wanted.host.test(hostname)) {
    return format === "slack"
      ? "A Slack address starts https://hooks.slack.com/. Make one by adding Incoming Webhooks to the channel."
      : "A Discord address starts https://discord.com/api/webhooks/. Make one in the channel's settings, under Integrations.";
  }
  return null;
}
