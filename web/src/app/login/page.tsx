import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { login, resendVerification } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { TextField } from "@/components/TextField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { safeNext } from "@/lib/forms";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; verified?: string; reset?: string }> }) {
  const { next, verified, reset } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));

  return (
    <AuthCard
      title="Sign in"
      description="For umpires, club admins and admins."
      footer={
        <>
          <Link href="/forgot-password">Forgotten your password?</Link>
          <span className="text-muted-foreground">
            New here? <Link href="/register">Register as an umpire</Link>
          </span>
          <details className="w-full pt-2">
            <summary className="cursor-pointer text-muted-foreground">Didn&apos;t get the confirmation email?</summary>
            <ActionForm action={resendVerification} submitLabel="Send a new link" variant="outline" className="pt-3">
              <TextField label="Email" name="email" id="resend-email" type="email" autoComplete="email" required />
            </ActionForm>
          </details>
        </>
      }
    >
      {(verified || reset) && (
        <Alert>
          <CircleCheck />
          <AlertDescription className="text-foreground">
            {verified ? "Your email address is confirmed. You can sign in now." : "Your password has been changed. Sign in with the new one."}
          </AlertDescription>
        </Alert>
      )}
      <ActionForm action={login} submitLabel="Sign in" pendingLabel="Signing in…" className="max-w-none">
        <input type="hidden" name="next" value={safeNext(next)} />
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      </ActionForm>
    </AuthCard>
  );
}
