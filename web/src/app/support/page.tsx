import { Activity, BookOpen, Bug, CloudUpload, KeyRound, LifeBuoy, ShieldCheck, Smartphone, Trash2, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session";
import { BUG_REPORT_URL, CONTACT_EMAIL, DOCS_URL, FEATURE_REQUEST_URL, LANDING_URL, SITE_NAME, STATUS_URL } from "@/lib/site";

export const metadata = {
  title: "Support",
  description: `Help with ${SITE_NAME}: your account, uploading and publishing matches, clubs, and how to report a problem.`,
};

/** What to put in a report, so a problem can actually be found. */
const REPORT_DETAILS = [
  "What happened, and what you expected instead.",
  "Where: this website, the phone app or the watch app.",
  "Your watch and phone, and the app's version (at the bottom of the phone app's Settings).",
  "The match it happened on, if it was one — its teams and date are enough.",
];

export default async function SupportPage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-8 py-2">
      <PageHeader
        title="Support"
        description={`How to get help with ${SITE_NAME}, whether you umpire with it or follow the results.`}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Topic icon={KeyRound} title="Signing in and your account">
          <ul className="space-y-2">
            <li>
              <span className="font-medium text-foreground">Told to confirm your email?</span> Follow the link in the email we sent when you registered.
              The sign-in page and the phone app will both send it again.
            </li>
            <li>
              <span className="font-medium text-foreground">Forgotten your password?</span>{" "}
              <Link href="/forgot-password">Ask for a reset link</Link> — it works for an hour. The phone app can do it too, without the browser.
            </li>
            <li>
              <span className="font-medium text-foreground">Changing your name or password,</span> or asking for your account to be deleted:{" "}
              <Link href="/account">your account page</Link>.
            </li>
          </ul>
        </Topic>

        <Topic icon={CloudUpload} title="Uploading and publishing">
          <ul className="space-y-2">
            <li>Matches are uploaded from the phone app, when you ask it to. Nothing goes up by itself.</li>
            <li>
              An uploaded match is a <span className="font-medium text-foreground">draft</span>: only you and your fellow umpire can see it. It becomes
              public when you publish it, from the phone or from{" "}
              {user ? <Link href="/dashboard">your dashboard</Link> : <Link href="/login">your dashboard</Link>}.
            </li>
            <li>Published matches can be shared with a link or a QR code, or downloaded as a report, a spreadsheet or data.</li>
          </ul>
        </Topic>

        <Topic icon={Users} title="Clubs and teams">
          <ul className="space-y-2">
            <li>
              Linking a match's teams to a club's teams puts it on their pages. Search for them while editing the match, on the phone or here.
            </li>
            <li>
              A club missing, or want to look after your club's teams? Ask from <Link href="/account">your account page</Link>, or when you register. An
              admin reviews the request.
            </li>
            <li>Club admins can see every match their teams played, including drafts, but only an umpire can change one.</li>
          </ul>
        </Topic>

        <Topic icon={Activity} title="Is it just you?">
          <ul className="space-y-2">
            <li>
              The <a href={STATUS_URL}>status page</a> checks this website and the API while you look at it, and lists anything going on or planned.
            </li>
            <li>If something there is down, it&apos;s us: no need to report it, and the page says when it&apos;s fixed.</li>
            <li>Matches on your phone are safe either way. Nothing is uploaded until you ask, and nothing is removed until an upload is confirmed.</li>
          </ul>
        </Topic>

        <Topic icon={Smartphone} title="The watch and phone apps">
          <ul className="space-y-2">
            <li>
              The guide has a page for each app — Wear OS, Apple Watch, the phone app and this website:{" "}
              <a href={DOCS_URL}>read the guide</a>.
            </li>
            <li>
              Watch and phone not finding each other, or a match that hasn&apos;t arrived? <a href={`${DOCS_URL}/#/guide/troubleshooting`}>Troubleshooting</a>{" "}
              covers the usual causes.
            </li>
            <li>
              Not got the apps yet? <a href={LANDING_URL}>They&apos;re here</a>, with what each stage of testing includes.
            </li>
          </ul>
        </Topic>

        <Topic icon={Bug} title="Report a bug, or ask for a feature">
          <p>Both are tracked in the open on GitHub, so you can see what&apos;s already known and follow it. The bug form asks for:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {REPORT_DETAILS.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
          <p className="mt-2">
            An issue is public, so leave out players&apos; names and anything else private. A feature request asks what you&apos;d like and what it
            would let you do on the pitch.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={BUG_REPORT_URL}>Report a bug</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={FEATURE_REQUEST_URL}>Ask for a feature</a>
            </Button>
          </div>
        </Topic>

        <Topic icon={ShieldCheck} title="Your matches and your data">
          <ul className="space-y-2">
            <li>A match stays on the umpire&apos;s watch and phone until they upload it, and stays a draft until they publish it.</li>
            <li>Deleting a match from the phone leaves the uploaded copy here, if you uploaded one.</li>
            <li>
              The <a href={`${LANDING_URL}/privacy`}>privacy policy</a> has the detail of what&apos;s stored and where.
            </li>
          </ul>
        </Topic>

        <Topic icon={Trash2} title="Deleting your account, or your data">
          <p className="font-medium text-foreground">Your account</p>
          <p className="mt-1">
            <Link href="/account">Your account page</Link> has <strong>Delete account</strong> at the bottom. An admin removes it. Can&apos;t sign in? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address the account
            uses.
          </p>
          <p className="mt-3 font-medium text-foreground">Your data, without closing the account</p>
          <ul className="mt-1 space-y-2">
            <li>Matches on your phone or watch: delete them in the app.</li>
            <li>
              A match you uploaded: unpublish it and it stops being public at once. To have the copy removed, email us its link. Deleted matches are
              purged after 30 days.
            </li>
            <li>
              Notifications: signing out of the phone app removes the token we hold for your device. Turning notifications off in your phone&apos;s
              settings stops them, but the token stays until you sign out.
            </li>
            <li>Workouts never reach this website at all.</li>
          </ul>
          <p className="mt-3">
            A published match stays as the record of that game when an account goes, with its umpire shown as a deleted user. Ask and we&apos;ll remove
            those too.
          </p>
        </Topic>
      </div>

      <Card>
        <CardContent className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-2">
            <h2 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-tight">
              <LifeBuoy className="size-6 text-primary" /> Still stuck?
            </h2>
            <p className="max-w-xl text-muted-foreground">
              The project&apos;s own support page lists every way to get hold of us, and the board shows what&apos;s being worked on right now.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={`${LANDING_URL}/support`}>Project support</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={DOCS_URL}>
                <BookOpen /> Docs
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** One subject, with the few things people actually need to know about it. */
function Topic({ icon: Icon, title, children }: { icon: typeof LifeBuoy; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <h2 className="font-semibold">{title}</h2>
        <div className="text-sm text-muted-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}
