import { describe, expect, it } from "vitest";
import { composeEmail, escapeHtml } from "../src/services/email.js";

const SITE = "https://app.fhmatchcentre.test";

describe("emails", () => {
  const mail = composeEmail(
    {
      to: "sam@example.com",
      subject: "Can you umpire M1 v Reading M1?",
      heading: "You've been asked to umpire",
      body: [
        "Oxford Hawks has asked you to umpire <M1> & Reading's M1.",
        { details: [["When", "Sat 26 Sep 2026, 14:00"]] },
        { list: ["First", "Second"] },
        { numbered: true, list: ["One", "Two"] },
        "More at https://example.com/guide.",
      ],
      action: { label: "Accept or decline", url: `${SITE}/appointments?x=1&y=2` },
      footnote: "If you didn't ask for this, ignore this email.",
    },
    SITE,
  );

  it("have a plain text version with every link written out", () => {
    expect(mail.text).toBe(
      [
        "Oxford Hawks has asked you to umpire <M1> & Reading's M1.",
        "When: Sat 26 Sep 2026, 14:00",
        "- First\n- Second",
        "1. One\n2. Two",
        "More at https://example.com/guide.",
        `Accept or decline:\n${SITE}/appointments?x=1&y=2`,
        "If you didn't ask for this, ignore this email.",
        `FH Match Centre\n${SITE}`,
      ].join("\n\n"),
    );
  });

  it("are laid out in HTML, with what's typed escaped and links made links", () => {
    const html = mail.html!;
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<h1");
    expect(html).toContain("You&#39;ve been asked to umpire");
    expect(html).toContain("&lt;M1&gt; &amp; Reading&#39;s M1");
    expect(html).not.toContain("<M1>");
    // The button, and the same link spelled out beneath it.
    expect(html).toContain(`href="${SITE}/appointments?x=1&amp;y=2"`);
    expect(html).toContain(">Accept or decline</a>");
    // A web address in a sentence is a link, without the full stop.
    expect(html).toContain('<a href="https://example.com/guide" style=');
    expect(html).toContain("<ol");
    expect(html).toContain("<ul");
    expect(html).toContain("Sat 26 Sep 2026, 14:00");
  });

  it("use the subject as the heading when there's none", () => {
    const plain = composeEmail({ to: "a@b.c", subject: "Reset your password", body: ["Hello."] }, SITE);
    expect(plain.html).toContain(">Reset your password</h1>");
    expect(plain.text).toBe(`Hello.\n\nFH Match Centre\n${SITE}`);
  });

  it("escape everything HTML treats specially", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
