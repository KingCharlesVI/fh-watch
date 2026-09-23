import Link from "next/link";
import { forgotPassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { TextField } from "@/components/TextField";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to choose a new one. It works for an hour."
      footer={<Link href="/login">Back to sign in</Link>}
    >
      <ActionForm action={forgotPassword} submitLabel="Email me a link" className="max-w-none">
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
      </ActionForm>
    </AuthCard>
  );
}
