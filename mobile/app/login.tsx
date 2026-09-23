import * as Linking from "expo-linking";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WEB_URL } from "@/config";
import { errorMessage } from "@/core/api";
import { useAuth } from "@/state/auth";
import { Banner, Button, Card, Field, Ionicons, Screen, T } from "@/ui/kit";
import { space, useColors } from "@/ui/theme";

export default function LoginScreen() {
  const { signIn, expired } = useAuth();
  const c = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen>
          <View style={{ alignItems: "center", gap: space.sm, marginTop: space.xl * 2, marginBottom: space.lg }}>
            <Ionicons name="stopwatch-outline" size={48} color={c.primary} />
            <T variant="title">FH Match Centre</T>
            <T variant="muted" style={{ textAlign: "center" }}>
              Matches from your watch, checked and shared from here.
            </T>
          </View>
          {expired && <Banner tone="warn" icon="time-outline" title="You've been signed out">Sign in again. Matches on this phone are kept.</Banner>}
          <Card>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
            {error && <Banner tone="danger" icon="alert-circle-outline" title={error} />}
            <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
          </Card>
          <Button title="Create an account" variant="ghost" onPress={() => Linking.openURL(`${WEB_URL}/register`)} />
          <Button title="Forgotten your password?" variant="ghost" onPress={() => Linking.openURL(`${WEB_URL}/forgot-password`)} />
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
