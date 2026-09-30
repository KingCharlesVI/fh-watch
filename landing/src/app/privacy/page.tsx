import type { Metadata } from "next";
import { Container, Logo } from "@/components/parts";
import { SITE } from "@/content";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * The app's privacy policy, at a public address Google Play can link to. The
 * source text is docs/privacy-policy.md; keep the two the same.
 */
export default function Privacy() {
  return (
    <>
      <header className="border-b">
        <Container className="flex h-14 items-center">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo size={28} /> {SITE.name}
          </a>
        </Container>
      </header>
      <main>
        <Container className="max-w-2xl py-14">
          <article className="space-y-5 text-muted-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_strong]:text-foreground">
            <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
            <p className="text-sm">For the alpha test. Last updated 25 September 2026.</p>
            <p>{SITE.name} is a watch and phone app that field hockey umpires use to time and record matches.</p>

            <h2 className="pt-4 text-xl font-semibold">What the app stores</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Matches you record:</strong> teams, scores, cards, timings and any names you type in (such as umpires&apos; names and
                players&apos; shirt numbers). They are stored on your watch and your phone.
              </li>
              <li>
                <strong>Your workout, if you turn on Record workout on the watch:</strong> your heart rate, steps, distance and calories during each
                match, read from the watch&apos;s sensors. They are stored on your watch and your phone, apart from the match: they&apos;re never in a
                match you share.
              </li>
              <li>
                <strong>Nothing else.</strong> There&apos;s no account, no analytics, no advertising and no tracking.
              </li>
            </ul>

            <h2 className="pt-4 text-xl font-semibold">Where it goes</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Between your watch and your phone:</strong> finished matches are sent from your watch to your phone using Google&apos;s Wear OS
                data connection, part of Google Play services on your devices.
              </li>
              <li>
                <strong>Nowhere else, unless you choose.</strong> A match or backup leaves your phone only when you save it to a folder or share it
                (for example by email). What happens to it then is up to the service you share it with.
              </li>
            </ul>
            <p>We don&apos;t collect, receive or sell any of your data. No servers are involved in this version of the app.</p>

            <h2 className="pt-4 text-xl font-semibold">Keeping and deleting</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Matches stay on your phone until you delete them. Uninstalling the app deletes them, so save a backup first if you want to keep them.</li>
              <li>The watch deletes finished matches 30 days after your phone has received them.</li>
            </ul>

            <h2 className="pt-4 text-xl font-semibold">Children</h2>
            <p>The app is intended for match officials aged 18 and over.</p>

            <h2 className="pt-4 text-xl font-semibold">Contact</h2>
            <p>
              {SITE.contactEmail ? (
                <>
                  Questions about this policy: <a href={`mailto:${SITE.contactEmail}`} className="text-primary hover:underline">{SITE.contactEmail}</a>.
                </>
              ) : (
                "Contact details will be added here before the alpha opens."
              )}
            </p>
          </article>
        </Container>
      </main>
    </>
  );
}
