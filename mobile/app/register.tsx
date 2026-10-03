import type { Club } from "@fh/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, View } from "react-native";
import { errorMessage } from "@/core/api";
import { api } from "@/services";
import { Banner, Button, Card, Choice, Field, Row, Screen, T, Text } from "@/ui/kit";
import { space, useColors } from "@/ui/theme";

type ClubChoice = "none" | "existing" | "new";

/**
 * Creating an account here instead of on the website. The API confirms the address
 * by email, so this ends by pointing the umpire at their inbox and back to sign-in.
 */
export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [choice, setChoice] = useState<ClubChoice>("none");
  const [club, setClub] = useState<Club | null>(null);
  const [clubName, setClubName] = useState("");
  const [wantsAdmin, setWantsAdmin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const tooShort = password.length > 0 && password.length < 10;
  const mismatch = again.length > 0 && again !== password;
  const clubReady = choice === "none" || (choice === "existing" ? club !== null : clubName.trim().length >= 2);
  const ready = displayName.trim() !== "" && email.trim() !== "" && password.length >= 10 && again === password && clubReady;

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

  const submit = () =>
    act(async () => {
      const address = email.trim();
      await api.register({
        email: address,
        password,
        displayName: displayName.trim(),
        clubRequest:
          choice === "existing" && club
            ? { clubId: club.id }
            : choice === "new"
              ? { clubName: clubName.trim(), wantsAdmin }
              : undefined,
      });
      setSentTo(address);
    });

  const resend = () =>
    act(async () => {
      await api.resendVerification(sentTo ?? email.trim());
      setResent(true);
    });

  if (sentTo) {
    return (
      <Screen>
        <Banner tone="primary" icon="mail-outline" title="Nearly done">
          We've sent a link to {sentTo}. Follow it to confirm your address, then sign in here.
        </Banner>
        {error && <Banner tone="danger" icon="alert-circle-outline" title={error} />}
        <Button title="Back to sign in" onPress={() => router.back()} />
        <Button
          title={resent ? "Sent again" : "Send the email again"}
          variant="ghost"
          onPress={resend}
          loading={busy}
          disabled={resent}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <T variant="muted">An account is free, and lets you upload matches, correct them and publish them. The same one works on the website.</T>
        <Card>
          <Field label="Your name" hint="Shown on matches you umpire." value={displayName} onChangeText={setDisplayName} maxLength={80} autoComplete="name" textContentType="name" />
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
          <Field
            label="Password"
            hint="At least 10 characters."
            error={tooShort ? "At least 10 characters." : undefined}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Field
            label="Password again"
            error={mismatch ? "The passwords don't match." : undefined}
            value={again}
            onChangeText={setAgain}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={() => {
              if (ready) void submit();
            }}
          />
        </Card>

        <Card title="Club (optional)">
          <Choice
            value={choice}
            options={[
              { value: "none", label: "Not now" },
              { value: "existing", label: "A club that's listed" },
              { value: "new", label: "My club isn't listed" },
            ]}
            onChange={(v) => {
              setChoice(v);
              setClub(null);
            }}
          />
          {choice === "existing" &&
            (club ? (
              <Row style={{ justifyContent: "space-between" }}>
                <T>{club.name}</T>
                <Button title="Change" variant="ghost" small onPress={() => setClub(null)} />
              </Row>
            ) : (
              <ClubSearch onPick={setClub} />
            ))}
          {choice === "new" && (
            <>
              <Field label="Club name" value={clubName} onChangeText={setClubName} maxLength={100} />
              <Row style={{ justifyContent: "space-between" }}>
                <T>Make me its club admin</T>
                <AdminSwitch value={wantsAdmin} onChange={setWantsAdmin} />
              </Row>
            </>
          )}
          {choice !== "none" && <T variant="small">An admin reviews club requests before they take effect.</T>}
        </Card>

        {error && <Banner tone="danger" icon="alert-circle-outline" title={error} />}
        <Button title="Create account" onPress={submit} loading={busy} disabled={!ready} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** Searches the club directory as you type (needs a connection), like the match editor's team search. */
function ClubSearch({ onPick }: { onPick: (club: Club) => void }) {
  const c = useColors();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Club[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchClubs(q.trim());
        if (live) {
          setResults(res.items);
          setProblem(null);
        }
      } catch (err) {
        if (live) setProblem(errorMessage(err));
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);
  return (
    <View style={{ gap: space.xs }}>
      <Field label="Which club?" value={q} onChangeText={setQ} placeholder="Search, e.g. Oxford Hawks" autoCorrect={false} />
      {problem && <T variant="small" style={{ color: c.danger }}>{problem}</T>}
      {q.trim().length >= 2 && results.length === 0 && !problem && <T variant="small">No club with that name yet.</T>}
      {results.map((club) => (
        <Pressable key={club.id} onPress={() => onPick(club)} style={[styles.result, { borderColor: c.border }]}>
          <Text style={{ color: c.text }}>{club.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function AdminSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary, false: c.border }} thumbColor="#FFFFFF" accessibilityLabel="Make me its club admin" />;
}

const styles = StyleSheet.create({
  result: { paddingVertical: 10, paddingHorizontal: space.md, borderWidth: 1, borderRadius: 8 },
});
