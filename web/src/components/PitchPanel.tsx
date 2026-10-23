import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A hockey pitch's markings in chalk, to scale (91.4 × 55 m, in decimetres): the boundary, the
 * halfway and 23 m lines, and at each end the shooting circle, its dashed 5 m line and the
 * penalty spot. Sliced to cover whatever box it's in, so a narrow one shows the middle.
 */
function Markings() {
  const end = (
    <>
      {/* The shooting circle: quarter circles of 14.63 m from each post, joined by a straight line. */}
      <path d="M0 110.4 A146.3 146.3 0 0 1 146.3 256.7 L146.3 293.3 A146.3 146.3 0 0 1 0 439.6" />
      <path d="M0 60.4 A196.3 196.3 0 0 1 196.3 256.7 L196.3 293.3 A196.3 196.3 0 0 1 0 489.6" strokeDasharray="10 16" />
      <circle cx="64.75" cy="275" r="3" fill="currentColor" stroke="none" />
    </>
  );
  return (
    <svg
      aria-hidden
      viewBox="0 0 914 550"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full text-chalk"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      vectorEffect="non-scaling-stroke"
    >
      <rect x="1.5" y="1.5" width="911" height="547" />
      <line x1="457" y1="0" x2="457" y2="550" />
      <line x1="229" y1="0" x2="229" y2="550" />
      <line x1="685" y1="0" x2="685" y2="550" />
      {end}
      <g transform="translate(914 0) scale(-1 1)">{end}</g>
    </svg>
  );
}

/** A dark turf panel with the pitch markings behind its content: the scoreboard, the home page's lead. */
export function PitchPanel({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section
      aria-label={label}
      className={cn(
        "relative isolate overflow-hidden rounded-xl bg-pitch text-pitch-foreground",
        // Mown stripes, barely there.
        "bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.025)_0_8.333%,transparent_8.333%_16.667%)]",
        className,
      )}
    >
      <Markings />
      <div className="relative">{children}</div>
    </section>
  );
}
