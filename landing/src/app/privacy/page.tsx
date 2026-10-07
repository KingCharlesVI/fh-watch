import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container, Logo } from "@/components/parts";
import { SITE } from "@/content";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * The privacy policy, at a public address Google Play can link to. The source text is
 * docs/privacy-policy.md; keep the two the same.
 */
export default function Privacy() {
  const email = SITE.contactEmail ?? "kcvi@tuta.com";
  const mail = <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>;
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
          <article className="space-y-5 text-muted-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">
            <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
            <p className="text-sm">Last updated 7 October 2026.</p>
            <p>
              {SITE.name} is a field hockey umpiring system: a watch app and a phone app that umpires use to time and record matches, and a website at
              app.fhmatchcentre.com where umpires publish results and clubs keep their teams up to date. This policy covers all of them, and the
              project&apos;s other sites: fhmatchcentre.com, docs.fhmatchcentre.com and status.fhmatchcentre.com.
            </p>
            <p>
              {SITE.name} is run by KCVI Development (&ldquo;we&rdquo;, &ldquo;us&rdquo;), who is responsible for your data under UK data protection law
              (the UK GDPR and the Data Protection Act 2018). You can reach us at {mail}.
            </p>

            <H2>The short version</H2>
            <List>
              <li>Matches are recorded on your watch and phone, and stay there until <strong>you</strong> upload them.</li>
              <li>What you upload is kept on our server. A match you <strong>publish</strong> can be seen by anyone.</li>
              <li>
                Your heart rate and other workout data, and the red card reports you fill in, <strong>never</strong> reach our server.
              </li>
              <li>We don&apos;t sell your data, show adverts, use analytics or track you.</li>
            </List>

            <H2>What we collect, and why</H2>

            <H3>Your account</H3>
            <p>
              When you register: your <strong>name</strong>, <strong>email address</strong> and a <strong>password</strong> (we keep only a scrambled
              form of it that can&apos;t be turned back into the password), and, if you ask for one, the <strong>club</strong> you&apos;d like to join or
              run. We also keep when your account was made, when you confirmed your email address, and your roles (umpire, club admin, admin).
            </p>
            <p>
              We use these to sign you in, to email you the links to confirm your address and reset your password, to show your name on the matches you
              umpire, and to let an admin approve a club request. Other signed-in umpires can find you by name, so they can add you as the second umpire
              on a match.
            </p>
            <Why>we need them to give you the account you asked for.</Why>

            <H3>Matches you upload</H3>
            <p>
              Nothing leaves your phone until you tap <strong>Upload</strong>. An uploaded match holds what was recorded on the watch and anything you
              added on the phone or the website: the teams&apos; names and colours, the score, goals, cards and the reasons for them, penalty corners and
              strokes, the shootout, times, the venue and competition, any notes you typed, the captains&apos; and players&apos;{" "}
              <strong>shirt numbers</strong>, and the names of the umpires. We keep every version of a match (its history), with who saved each one and
              when.
            </p>
            <List>
              <li>
                A match you&apos;ve uploaded but not published is a <strong>draft</strong>: only you, the other umpire on it, the admins of the clubs
                whose teams played, and our admins can see it.
              </li>
              <li>
                A match you <strong>publish</strong> is public: anyone can see it on the website and download it, and search engines may list it.
                Players are shown by shirt number, never by name, but people who know the teams may recognise them. You can unpublish a match at any
                time.
              </li>
            </List>
            <Why>
              uploading and publishing are what you use the service for, and publishing results is in the legitimate interest of the clubs, players
              and umpires who follow them.
            </Why>

            <H3>Notifications</H3>
            <p>
              If you turn on notifications in the phone app, your phone gets a <strong>push token</strong> from Apple or Google (through Expo, the
              service the app is built with), which we store with your account so we could send you a message about your matches later. We don&apos;t
              send any yet: the reminders to upload a match are made on your phone. Signing out removes the token.
            </p>

            <H3>Asking to join the test</H3>
            <p>
              The form on fhmatchcentre.com asks for your <strong>name</strong>, <strong>email address</strong>, the <strong>watch and phone</strong>{" "}
              you&apos;d use, and anything you&apos;d like to add. We use them to decide on your request and to email you the answer, with the
              invitation if it&apos;s approved.
            </p>

            <H3>Security and running the service</H3>
            <p>
              Our server records each request it receives, with the <strong>IP address</strong> it came from and the time, to keep the service working
              and secure: for example, to limit repeated sign-in attempts, which we count per IP address and email address. We also keep a log of
              changes made through the service (who changed which match, club or account, and when), so mistakes and misuse can be traced. The server
              deletes its request logs after 30 days.
            </p>
            <Why>it&apos;s in our legitimate interest, and yours, to keep the service and your account secure.</Why>

            <H3>On the website</H3>
            <p>
              The website sets cookies only to keep you signed in. There are no advertising or analytics cookies. The light or dark theme you choose is
              remembered in your browser and never sent to us.
            </p>

            <H2>What stays on your devices</H2>
            <p>These are stored on your watch and phone only. We never receive them unless you send them to us yourself:</p>
            <List>
              <li>
                <strong>Your workout</strong>, if you turn on <strong>Record workout</strong> on the watch: your heart rate, steps, distance and calories
                during each match. It&apos;s kept with the match on your phone, but it&apos;s never part of a match you upload or share. If you choose,
                the app saves it to <strong>Health Connect</strong> (Android) or <strong>Apple Health</strong> (Apple Watch), where other fitness apps you
                allow can read it. The app only writes to them; it never reads anything from them.
              </li>
              <li>
                <strong>Red card reports</strong> you fill in: your name, qualification and contact details, your colleague&apos;s name, and the
                offender&apos;s name, age group, club and team, with your account of what happened. They&apos;re for you to copy into England
                Hockey&apos;s form or share yourself; what happens then is covered by England Hockey&apos;s own policy.
              </li>
              <li>
                <strong>Upcoming matches</strong> you set up ahead of time, and matches you haven&apos;t uploaded.
              </li>
              <li>
                <strong>Backups and exports</strong> you make. They go wherever you save or share them.
              </li>
            </List>

            <H2>Who else handles your data</H2>
            <p>We use a small number of services to run {SITE.name}. Each only gets what it needs to do its job:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm [&_td]:border-t [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3 [&_th]:text-foreground">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>What for</th>
                    <th>What it handles</th>
                  </tr>
                </thead>
                <tbody>
                  {PROCESSORS.map(([who, what, handles]) => (
                    <tr key={String(what)}>
                      <td>{who}</td>
                      <td>{what}</td>
                      <td>{handles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Our server and its database are in the United Kingdom. Some of these services are based in, or may handle data in, the United States and
              elsewhere; where they do, they protect it with the safeguards UK law requires, such as the UK&apos;s data bridge with the US or the
              standard contract clauses.
            </p>
            <p>We don&apos;t sell your data or share it with anyone else, unless the law requires us to.</p>

            <H2>How long we keep it</H2>
            <List>
              <li>
                <strong>Your account:</strong> until it&apos;s deleted (below).
              </li>
              <li>
                <strong>Matches:</strong> until they&apos;re deleted. A match an admin deletes is kept for 30 days in case of mistakes, then removed for
                good.
              </li>
              <li>
                <strong>Requests to join the test and club requests:</strong> 12 months after we answer them. Requests still waiting for an answer are
                kept until we do.
              </li>
              <li>
                <strong>Sign-in sessions:</strong> up to 30 days. Email links expire after 24 hours (confirming your email address) or 1 hour
                (resetting your password).
              </li>
              <li>
                <strong>Backups:</strong> we back up the database regularly and keep each backup for 14 days. Something deleted from the service
                disappears from the backups as they&apos;re replaced.
              </li>
            </List>

            <H2>Deleting your account</H2>
            <p>
              Ask for it from your account page on the website (<strong>Delete account</strong>), or email us. An admin then deletes your account, your
              sign-in sessions, any push tokens and your club requests. The matches you uploaded stay on the service, because they&apos;re also the
              other umpire&apos;s and the clubs&apos; record of the match, but your name on them is replaced with &ldquo;Deleted user&rdquo;. If
              you&apos;d also like particular matches removed, tell us.
            </p>
            <p>Our log of changes keeps a note that the account was deleted, with its email address, so we can show it was done.</p>

            <H2>Your rights</H2>
            <p>
              You have the right to see the personal data we hold about you, to have it corrected, to have it deleted, to object to or restrict how we
              use it, and to have a copy of what you gave us in a form you can reuse. You can correct your name on your account page, and download your
              matches from the website at any time. For anything else, email {mail}; we&apos;ll answer within a month.
            </p>
            <p>
              If you&apos;re unhappy with how we&apos;ve handled your data, please tell us first. You can also complain to the Information
              Commissioner&apos;s Office (
              <a href="https://ico.org.uk" className="text-primary hover:underline">
                ico.org.uk
              </a>
              , 0303 123 1113).
            </p>

            <H2>Children</H2>
            <p>{SITE.name} is for match officials aged 18 and over. Players appear in matches by shirt number only.</p>

            <H2>Changes to this policy</H2>
            <p>
              When we change this policy, we&apos;ll update the date at the top, and for a significant change we&apos;ll tell you in the app or by
              email.
            </p>

            <H2>Contact</H2>
            <p>Questions about this policy or your data: {mail}.</p>
          </article>
        </Container>
      </main>
    </>
  );
}

const PROCESSORS: [ReactNode, string, string][] = [
  [<strong key="cf">Cloudflare</strong>, "Connecting app.fhmatchcentre.com to our server, securely", "Every request to the website and app, including your IP address"],
  [
    <>
      <strong>Amazon Web Services</strong> (Simple Email Service, in Stockholm, Sweden)
    </>,
    "Sending our emails",
    "Your email address and the email's contents",
  ],
  [<strong key="v">Vercel</strong>, "Hosting fhmatchcentre.com, the documentation and the status page", "Visits to those sites, including your IP address"],
  [
    <>
      <strong>Google</strong> (Wear OS) and <strong>Apple</strong> (watchOS)
    </>,
    "Sending matches from your watch to your phone",
    "Matches, on their way between your own devices",
  ],
  [
    <>
      <strong>Expo</strong>, <strong>Google</strong> and <strong>Apple</strong>
    </>,
    "Push notifications, if you turn them on",
    "Your device's push token",
  ],
  [<strong key="gh">GitHub</strong>, "Checking for and downloading updates, in the Android apps installed from GitHub", "Your phone's IP address when it checks"],
  [
    <>
      <strong>Google Play</strong> and <strong>Apple TestFlight</strong>
    </>,
    "Installing the apps",
    "Covered by Google's and Apple's own policies",
  ],
];

function H2({ children }: { children: ReactNode }) {
  return <h2 className="pt-4 text-xl font-semibold">{children}</h2>;
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 font-semibold">{children}</h3>;
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

/** The lawful basis, in the policy's words. */
function Why({ children }: { children: ReactNode }) {
  return (
    <p>
      <em>Why we&apos;re allowed to:</em> {children}
    </p>
  );
}
