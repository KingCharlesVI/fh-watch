import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/** The centred card used by sign-in, registration and password pages. */
export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md py-4 sm:py-10">
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
