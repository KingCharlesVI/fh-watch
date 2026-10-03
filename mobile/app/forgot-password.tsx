import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { errorMessage } from "@/core/api";
import { resetTokenFrom } from "@/core/reset-link";
import { api } from "@/services";
import { Banner, Button, Card, Field, Screen, T } from "@/ui/kit";

/**
 * Resetting a forgotten password without leaving the app. The emailed link goes to
 * the website, so the second step takes the link (or just the token) pasted from
 * the email: the app never sees the old password, and the API ends every session.
 */
export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<"email" | "link">("email");
  const [email, setEmail] = useState("");
  const [pasted, setPasted] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 10;
  const mismatch = again.length > 0 && again !== password;
  const ready = pasted.trim() !== "" && password.length >= 10 && again === password;

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const sendEmail = () =>
    act(async () => {
      await api.forgotPassword(email.trim());
      setStep("link");
    });

  const reset = () =>
    act(async () => {
      await api.resetPassword(resetTokenFrom(pasted), password);
      setDone(true);
    });

  if (done) {
    return (
      <Screen>
        <Banner tone="primary" icon="checkmark-circle-outline" title="Password changed">
          Sign in with your new password. Anywhere else you were signed in has been signed out.
        </Banner>
        <Button title="Back to sign in" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        {step === "email" ? (
          <>
            <T variant="muted">We'll email you a link. It works for an hour.</T>
            <Card>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                onSubmitEditing={() => {
                  if (email.trim()) void sendEmail();
                }}
              />
              {error && <Banner tone="danger" icon="alert-circle-outline" title={error} />}
              <Button title="Email me a link" onPress={sendEmail} loading={busy} disabled={!email.trim()} />
            </Card>
            <Button title="I already have the link" variant="ghost" onPress={() => setStep("link")} />
          </>
        ) : (
          <>
            <Banner tone="primary" icon="mail-outline" title="Check your email">
              Copy the link from the email and paste it below, then choose your new password. The link works for an hour.
            </Banner>
            <Card>
              <Field
                label="The link from the email"
                hint="Paste the whole link. Or just the token, if that's easier."
                value={pasted}
                onChangeText={setPasted}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
              <Field
                label="New password"
                hint="At least 10 characters."
                error={tooShort ? "At least 10 characters." : undefined}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <Field
                label="New password again"
                error={mismatch ? "The passwords don't match." : undefined}
                value={again}
                onChangeText={setAgain}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                onSubmitEditing={() => {
                  if (ready) void reset();
                }}
              />
              {error && <Banner tone="danger" icon="alert-circle-outline" title={error} />}
              <Button title="Change my password" onPress={reset} loading={busy} disabled={!ready} />
            </Card>
            <Button title="Send the email again" variant="ghost" onPress={() => setStep("email")} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
