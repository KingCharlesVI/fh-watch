import * as Notifications from "expo-notifications";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { notificationTarget } from "@/services/push";
import { AuthProvider, useAuth } from "@/state/auth";
import { ONLINE } from "@/config";
import { useSyncTriggers, useWatchInbox } from "@/state/sync";
import { useUpdateChecks } from "@/state/updates";
import { FONT, useColors } from "@/ui/theme";

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <SafeAreaProvider>
      <ThemeProvider
        value={{ ...base, colors: { ...base.colors, primary: c.primary, background: c.background, card: c.card, text: c.text, border: c.border } }}
      >
        <AuthProvider>
          <Navigator />
        </AuthProvider>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Navigator() {
  const { status } = useAuth();
  const c = useColors();
  const signedIn = status === "signedIn";
  // Alpha has no accounts: the app is always open, and watch matches come straight in.
  const open = !ONLINE || signedIn;
  useWatchInbox(open);
  useSyncTriggers(ONLINE && signedIn);
  useUpdateChecks();

  // A tapped notification opens its match (or its editor, when teams need linking).
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!ONLINE || !signedIn || !lastResponse) return;
    const target = notificationTarget(lastResponse);
    if (target) router.push(target as never);
  }, [signedIn, lastResponse]);

  if (ONLINE && status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerTintColor: c.text,
        headerTitleStyle: { color: c.text, fontFamily: FONT, fontWeight: "600" },
        headerStyle: { backgroundColor: c.card },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Protected guard={open}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="match/[id]/index" options={{ title: "Match" }} />
        <Stack.Screen name="match/[id]/edit" options={{ title: "Edit match" }} />
        <Stack.Screen name="match/[id]/share" options={{ title: "Share", presentation: "modal" }} />
        {/* Setup on phone: the watch opens this (fhmatchcentre://setup). */}
        <Stack.Screen name="setup" options={{ title: "Set up a match" }} />
      </Stack.Protected>
      <Stack.Protected guard={!open}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
