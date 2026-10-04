import { ArrowUpRight, Check, ChevronDown, Download, Mail, Quote } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { type Faq, SITE, type StoreLink, TESTIMONIALS } from "@/content";
import { LatestApk } from "./LatestApk";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-5xl px-5 ${className}`}>{children}</div>;
}

export function Section({ id, eyebrow, title, intro, children }: { id?: string; eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t py-20">
      <Container>
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        {intro && <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{intro}</p>}
        <div className="mt-10">{children}</div>
      </Container>
    </section>
  );
}

/** GitHub's mark (lucide no longer has brand icons). */
export function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return <Image src="/icon.png" alt="" width={size} height={size} className="rounded-lg" priority />;
}

export function Button({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "outline" }) {
  const look =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/85"
      : "border bg-background text-foreground hover:bg-muted";
  return (
    <a href={href} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${look}`}>
      {children}
    </a>
  );
}

const STORE_NAMES = { "google-play": "Google Play", "app-store": "App Store", testflight: "TestFlight", apk: "APK" } as const;

/** A store button, or a quiet "Coming soon" when there's no link yet. */
export function StoreButton({ link }: { link: StoreLink }) {
  if (link.latest) return <LatestApk app={link.latest} label={link.label} />;
  if (!link.href) {
    return (
      <span className="flex h-11 items-center justify-between gap-3 rounded-lg border border-dashed px-4 text-sm text-muted-foreground">
        <span>{link.label}</span>
        <span className="text-xs">Coming soon</span>
      </span>
    );
  }
  if (link.store === "apk") {
    // A file, downloaded rather than opened.
    return (
      <a
        href={link.href}
        download
        className="flex h-11 items-center justify-between gap-3 rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
      >
        <span className="inline-flex items-center gap-2">
          <Download className="size-4" /> {link.label}
        </span>
        {link.detail && <span className="text-xs text-muted-foreground">{link.detail}</span>}
      </a>
    );
  }
  return (
    <a
      href={link.href}
      className="flex h-11 items-center justify-between gap-3 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85"
    >
      <span>{link.label}</span>
      <span className="inline-flex items-center gap-1 text-xs opacity-80">
        {STORE_NAMES[link.store]} <ArrowUpRight className="size-3.5" />
      </span>
    </a>
  );
}

/** Points at the forms further down the page, which are what actually asks. */
export function RequestAccess({ stage }: { stage: string }) {
  return (
    <a href="#request" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <Mail className="size-4" /> Ask to join the {stage}
    </a>
  );
}

/** A round watch face showing a real screenshot from the app. */
export function WatchFrame({ src, alt, size = 432 }: { src: string; alt: string; size?: number }) {
  return (
    <div className="relative size-56 shrink-0 rounded-full bg-neutral-900 p-3 shadow-xl ring-1 ring-black/10 sm:size-64">
      <div className="size-full overflow-hidden rounded-full bg-black">
        <Image src={src} alt={alt} width={size} height={size} className="size-full object-cover" />
      </div>
      {/* The two buttons of a Galaxy Watch: the lower one starts and stops the clock. */}
      <span className="absolute top-[28%] -right-1.5 h-8 w-2 rounded-r-md bg-neutral-700" />
      <span className="absolute top-[58%] -right-1.5 h-8 w-2 rounded-r-md bg-primary" title="Start / stop" />
    </div>
  );
}

/** A phone outline showing a real screenshot from the app. */
export function PhoneFrame({ src, alt, width = 945, height = 2048 }: { src: string; alt: string; width?: number; height?: number }) {
  return (
    <div className="w-52 shrink-0 rounded-[2.2rem] bg-neutral-900 p-2 shadow-xl ring-1 ring-black/10 sm:w-60">
      <div className="overflow-hidden rounded-[1.8rem] bg-white">
        <Image src={src} alt={alt} width={width} height={height} className="h-auto w-full" />
      </div>
    </div>
  );
}

/** How to install the APKs, for testers not using Google Play. */
export function ApkInstructions() {
  return (
    <details className="rounded-lg border px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">How to install the APKs</summary>
      <div className="mt-3 space-y-3 text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Install both from here, or both from Google Play,</span> not one of each: the watch only talks to a
          phone app from the same place. To switch, uninstall both first.
        </p>
        <div>
          <p className="font-medium text-foreground">Phone</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>On your Android phone, tap <em>Phone app (APK)</em>.</li>
            <li>Open the downloaded file. If asked, allow your browser to install apps.</li>
          </ol>
        </div>
        <div>
          <p className="font-medium text-foreground">Watch</p>
          <p className="mt-1">A watch can&apos;t download apps from a web page, so the watch app goes on from a computer:</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>
              On the watch: Settings → About watch → Software information → tap <em>Software version</em> five times to turn on developer options. In
              Developer options, turn on <em>ADB debugging</em> and <em>Wireless debugging</em> (<em>Debug over Wi-Fi</em> on older watches). Keep the
              watch on the same Wi-Fi as the computer.
            </li>
            <li>
              On a computer with{" "}
              <a className="underline" href="https://developer.android.com/tools/releases/platform-tools">
                Android platform tools
              </a>
              , download <em>Watch app (APK)</em>. On newer watches, tap <em>Pair new device</em> under Wireless debugging and run{" "}
              <code className="rounded bg-muted px-1">adb pair &lt;address&gt; &lt;code&gt;</code> with what it shows. Then run{" "}
              <code className="rounded bg-muted px-1">adb connect &lt;address&gt;</code> with the address shown under Wireless debugging (accept the
              prompt on the watch), and <code className="rounded bg-muted px-1">adb install &lt;the APK file&gt;</code>.
            </li>
            <li>Turn ADB debugging off again afterwards: it uses battery.</li>
          </ol>
        </div>
      </div>
    </details>
  );
}

export interface Step {
  title: string;
  detail: string;
  status: "done" | "now" | "next";
}

const STEP_LOOK = {
  done: { circle: "bg-primary text-primary-foreground", line: "bg-primary", label: "Done" },
  now: { circle: "bg-primary text-primary-foreground ring-4 ring-primary-soft", line: "bg-border", label: "We are here" },
  next: { circle: "border bg-background text-muted-foreground", line: "bg-border", label: "Next" },
} as const;

/**
 * Which stage the project is in: a row of numbered steps on a line, stacked on a
 * phone. The step we're in is filled and ringed, and finished ones carry a tick.
 */
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-x-4 sm:grid-cols-3">
      {steps.map((step, i) => {
        const look = STEP_LOOK[step.status];
        const last = i === steps.length - 1;
        return (
          <li key={step.title} className="flex gap-4 sm:block">
            {/* The rail: down the side on a phone, along the top on a wider screen. */}
            <div className="flex flex-col items-center sm:flex-row">
              <span
                aria-hidden="true"
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${look.circle}`}
              >
                {step.status === "done" ? <Check className="size-4" /> : i + 1}
              </span>
              {!last && <span aria-hidden="true" className={`w-px flex-1 sm:h-px sm:w-full ${look.line}`} />}
            </div>
            <div className={`pb-8 sm:mt-4 sm:pr-6 ${last ? "pb-0" : ""}`}>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{step.title}</h3>
                {step.status === "now" && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Now</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
              <p className="mt-2 text-xs font-medium text-muted-foreground uppercase">{look.label}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** What umpires say, or an honest note while the testing is still private. */
export function Testimonials({ askHref }: { askHref: string }) {
  if (TESTIMONIALS.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6">
        <p className="font-medium">A small group of umpires is using it on real matches.</p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          What they say will appear here as they&apos;re happy to be quoted. If you&apos;re testing it,{" "}
          <a href={askHref} className="font-medium text-primary underline">
            tell us how it went
          </a>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {TESTIMONIALS.map((t) => (
        <figure key={t.name} className="flex flex-col rounded-xl border bg-card p-5">
          <Quote className="size-5 text-primary" aria-hidden="true" />
          <blockquote className="mt-3 text-sm">{t.quote}</blockquote>
          <figcaption className="mt-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t.name}</span>
            {t.detail && <span> · {t.detail}</span>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** The questions, as a plain list that opens and closes without any JavaScript. */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="rounded-xl border bg-card px-5">
      {faqs.map((faq) => (
        <details key={faq.question} className="group border-b py-4 last:border-b-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
            {faq.question}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}

/** The closing call to action, for anyone who has read the whole page. */
export function CtaBand({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="border-t bg-primary-soft py-16">
      <Container className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-lg text-muted-foreground">{intro}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
      </Container>
    </section>
  );
}
