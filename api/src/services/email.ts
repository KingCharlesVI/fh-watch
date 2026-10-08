import type { Mail } from "./mailer.js";

/**
 * Every email the service sends, built the same way: a heading, paragraphs, lists and
 * details, one button for the main link, and small print. Each comes out as HTML (a
 * table-based layout with inline styles, which email clients need) and as plain text
 * with the links written out, for clients that show that instead.
 */

/** A paragraph, a bulleted (or numbered) list, or labelled details such as "Name: Sam". */
export type EmailBlock = string | { list: string[]; numbered?: boolean } | { details: [label: string, value: string][] };

export interface EmailContent {
  to: string;
  subject: string;
  /** Shown large at the top of the HTML email; the subject if left out. */
  heading?: string;
  body: EmailBlock[];
  /** The one thing to do, as a button. */
  action?: { label: string; url: string };
  /** Small print after everything else, e.g. "If you didn't ask for this, ignore this email." */
  footnote?: string;
}

const BRAND = "FH Match Centre";
const GREEN = "#106C3E";
const INK = "#18241d";
const TEXT = "#33433a";
const MUTED = "#6b776f";
const LINE = "#e2e6df";
const PAGE = "#f3f5f1";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Escaped text with any web addresses in it as links (without a sentence's closing punctuation). */
function linked(value: string): string {
  return escapeHtml(value).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)'"]/g, (url) => `<a href="${url}" style="color:${GREEN};">${url}</a>`);
}

const p = (html: string, style = "") => `<p style="margin:0 0 16px;font:15px/1.6 ${FONT};color:${TEXT};${style}">${html}</p>`;

function blockHtml(block: EmailBlock): string {
  if (typeof block === "string") return p(linked(block).replace(/\n/g, "<br>"));
  if ("list" in block) {
    const tag = block.numbered ? "ol" : "ul";
    const items = block.list.map((item) => `<li style="margin:0 0 6px;">${linked(item)}</li>`).join("");
    return `<${tag} style="margin:0 0 16px;padding-left:22px;font:15px/1.6 ${FONT};color:${TEXT};">${items}</${tag}>`;
  }
  const rows = block.details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px 8px 0;font:14px/1.5 ${FONT};color:${MUTED};white-space:nowrap;vertical-align:top;border-top:1px solid ${LINE};">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 0;font:14px/1.5 ${FONT};color:${INK};vertical-align:top;border-top:1px solid ${LINE};">${linked(value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border-collapse:collapse;border-bottom:1px solid ${LINE};">${rows}</table>`;
}

function blockText(block: EmailBlock): string {
  if (typeof block === "string") return block;
  if ("list" in block) return block.list.map((item, i) => (block.numbered ? `${i + 1}. ${item}` : `- ${item}`)).join("\n");
  return block.details.map(([label, value]) => `${label}: ${value}`).join("\n");
}

/** Builds the email, as HTML and as plain text. `site` is the website's address, for the footer. */
export function composeEmail(content: EmailContent, site: string): Mail {
  const { to, subject, body, action, footnote } = content;
  const heading = content.heading ?? subject;

  const text = [
    ...body.map(blockText),
    ...(action ? [`${action.label}:\n${action.url}`] : []),
    ...(footnote ? [footnote] : []),
    `${BRAND}\n${site}`,
  ].join("\n\n");

  const firstParagraph = body.find((b): b is string => typeof b === "string") ?? "";
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>` +
      `<td style="border-radius:8px;background:${GREEN};" bgcolor="${GREEN}">` +
      `<a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 22px;font:600 15px/1.2 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(action.label)}</a>` +
      `</td></tr></table>` +
      p(`If the button doesn't work, open this link:<br><a href="${escapeHtml(action.url)}" style="color:${GREEN};word-break:break-all;">${escapeHtml(action.url)}</a>`, `font-size:13px;color:${MUTED};`)
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(firstParagraph.slice(0, 140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};" bgcolor="${PAGE}">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;">
<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${GREEN};vertical-align:middle;"></span>
<span style="font:600 16px/1 ${FONT};color:${INK};vertical-align:middle;margin-left:6px;">${BRAND}</span>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:32px 28px;" bgcolor="#ffffff">
<h1 style="margin:0 0 20px;font:600 21px/1.3 ${FONT};color:${INK};">${escapeHtml(heading)}</h1>
${body.map(blockHtml).join("\n")}
${button}
${footnote ? p(linked(footnote), `font-size:13px;color:${MUTED};margin:0;`) : ""}
</td></tr>
<tr><td style="padding:16px 4px;font:12px/1.6 ${FONT};color:${MUTED};">
${BRAND}, the field hockey umpiring system · <a href="${escapeHtml(site)}" style="color:${MUTED};">${escapeHtml(site.replace(/^https?:\/\//, ""))}</a><br>
This email was sent automatically; replies aren't read.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { to, subject, text, html };
}
