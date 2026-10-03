import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SITE_NAME } from "@/lib/site";

/** The centred card used by sign-in, registration and password pages, under the app's icon. */
export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-4 sm:py-10">
      <Link href="/" className="mx-auto flex w-fit flex-col items-center gap-3 text-foreground no-underline hover:no-underline">
        <Image src="/logo.png" alt="" width={56} height={56} className="rounded-2xl shadow-sm" priority />
        <span className="font-heading text-lg font-semibold tracking-tight">{SITE_NAME}</span>
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
        {footer && <CardFooter className="flex-col items-start gap-2 text-sm">{footer}</CardFooter>}
      </Card>
    </div>
  );
}
