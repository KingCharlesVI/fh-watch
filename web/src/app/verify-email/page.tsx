import { CircleAlert } from "lucide-react";
import { verifyEmail } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata = { title: "Confirm your email" };

/**
 * The link from the confirmation email lands here. Confirming takes a click,
 * because email scanners open links automatically and would use up the token.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Confirm your email address" description="One click and your account is ready.">
      {token ? (
        <ActionForm action={verifyEmail} submitLabel="Confirm my email address" pendingLabel="Confirming…">
          <input type="hidden" name="token" value={token} />
        </ActionForm>
      ) : (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>This link is incomplete. Open the link from the email again, or copy the whole address.</AlertTitle>
        </Alert>
      )}
    </AuthCard>
  );
}
