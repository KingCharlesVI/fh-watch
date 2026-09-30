import Image from "next/image";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";

/** The app icon and name, linking home: the same mark as the apps and the landing page. */
export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5 font-heading font-semibold tracking-tight text-foreground no-underline hover:no-underline", className)}>
      <Image src="/logo.png" alt="" width={size} height={size} className="rounded-lg" priority />
      <span>{SITE_NAME}</span>
    </Link>
  );
}
