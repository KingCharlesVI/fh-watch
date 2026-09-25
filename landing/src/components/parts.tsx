import { ArrowUpRight, Mail } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { SITE, type StoreLink } from "@/content";

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

const STORE_NAMES = { "google-play": "Google Play", "app-store": "App Store", testflight: "TestFlight" } as const;

/** A store button, or a quiet "Coming soon" when there's no link yet. */
export function StoreButton({ link }: { link: StoreLink }) {
  if (!link.href) {
    return (
      <span className="flex h-11 items-center justify-between gap-3 rounded-lg border border-dashed px-4 text-sm text-muted-foreground">
        <span>{link.label}</span>
        <span className="text-xs">Coming soon</span>
      </span>
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

export function RequestAccess({ stage }: { stage: string }) {
  if (!SITE.contactEmail) return null;
  const href = `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(`Join the FH Match Centre ${stage}`)}&body=${encodeURIComponent(
    "Hello,\n\nI'd like to join the test. The Google account on my phone is:\n\nMy watch is a:\n\nThanks!",
  )}`;
  return (
    <a href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <Mail className="size-4" /> Ask to join
    </a>
  );
}

/** A round watch face showing a real screenshot from the app. */
export function WatchFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative size-56 shrink-0 rounded-full bg-neutral-900 p-3 shadow-xl ring-1 ring-black/10 sm:size-64">
      <div className="size-full overflow-hidden rounded-full bg-black">
        <Image src={src} alt={alt} width={454} height={454} className="size-full object-cover" />
      </div>
      {/* The two buttons of a Galaxy Watch: the lower one starts and stops the clock. */}
      <span className="absolute top-[28%] -right-1.5 h-8 w-2 rounded-r-md bg-neutral-700" />
      <span className="absolute top-[58%] -right-1.5 h-8 w-2 rounded-r-md bg-primary" title="Start / stop" />
    </div>
  );
}

/** A phone outline showing a real screenshot from the app. */
export function PhoneFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="w-52 shrink-0 rounded-[2.2rem] bg-neutral-900 p-2 shadow-xl ring-1 ring-black/10 sm:w-60">
      <div className="overflow-hidden rounded-[1.8rem] bg-white">
        <Image src={src} alt={alt} width={1080} height={2400} className="h-auto w-full" />
      </div>
    </div>
  );
}
