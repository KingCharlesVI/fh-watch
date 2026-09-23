import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { resetPassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { TextField } from "@/components/TextField";
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password" description="You'll be signed out everywhere else.">
      {token ? (
        <ActionForm action={resetPassword} submitLabel="Save new password" className="max-w-none">
          <input type="hidden" name="token" value={token} />
          <TextField label="New password" hint="At least 10 characters." name="password" type="password" autoComplete="new-password" minLength={10} required />
          <TextField label="New password again" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        </ActionForm>
      ) : (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>
            This link is incomplete. <Link href="/forgot-password">Ask for a new one</Link>.
          </AlertTitle>
        </Alert>
      )}
    </AuthCard>
  );
}
