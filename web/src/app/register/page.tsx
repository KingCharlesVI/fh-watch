import Link from "next/link";
import { redirect } from "next/navigation";
import { register } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { ClubRequestFields } from "@/components/ClubRequestFields";
import { TextField } from "@/components/TextField";
import { api } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import type { Club, Items } from "@/lib/types";

export const metadata = { title: "Register" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const clubs = await api<Items<Club>>("/v1/clubs", { auth: false });

  return (
    <AuthCard
      title="Register as an umpire"
      description="Upload matches from your watch, correct them and share them."
      footer={
        <span className="text-muted-foreground">
          Already registered? <Link href="/login">Sign in</Link>
        </span>
      }
    >
      <ActionForm action={register} submitLabel="Create account" pendingLabel="Creating…" className="max-w-none">
        <TextField label="Your name" hint="Shown on matches you umpire." name="displayName" autoComplete="name" required maxLength={80} />
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField label="Password" hint="At least 10 characters." name="password" type="password" autoComplete="new-password" minLength={10} required />
        <TextField label="Password again" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        <ClubRequestFields clubs={clubs.items} optional />
      </ActionForm>
    </AuthCard>
  );
}
