import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SITE_NAME } from "@/lib/site";

/** The centred card used by sign-in, registration and password pages, under the app's icon. */
export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-8 py-4 sm:py-12">
      <Link href="/" className="mx-auto flex w-fit flex-col items-center gap-3 text-foreground no-underline hover:no-underline">
        <Image src="/logo.png" alt="" width={56} height={56} className="rounded-xl shadow-sm" priority />
        <span className="font-heading text-lg font-bold tracking-tight">{SITE_NAME}</span>
      </Link>
      <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-extrabold">{title}</CardTitle>
          {description && <CardDescription className="text-base">{description}</CardDescription>}
        </CardHeader>
        {/* The page's main button runs the width of the card. */}
        <CardContent className="space-y-4 [&>form>div>[data-slot=button][type=submit]]:h-11 [&>form>div>[data-slot=button][type=submit]]:w-full">{children}</CardContent>
        {footer && <CardFooter className="flex-col items-center gap-2 bg-transparent text-center text-sm">{footer}</CardFooter>}
      </Card>
    </div>
  );
}
