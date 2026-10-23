import { StyleSheet, View } from "react-native";
import { FONT, useColors } from "./theme";

/** The header bar's background, like the website's header: a card edged in pitch green along the top, with a hairline under it. */
export function HeaderBackground() {
  const c = useColors();
  return <View style={{ flex: 1, backgroundColor: c.card, borderTopWidth: 3, borderTopColor: c.pitch, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }} />;
}

/** Header options shared by the stack and the tabs. */
export function useHeaderOptions() {
  const c = useColors();
  return {
    headerTintColor: c.text,
    headerTitleStyle: { color: c.text, fontFamily: FONT, fontWeight: "700" as const, fontSize: 18 },
    headerBackground: () => <HeaderBackground />,
    headerShadowVisible: false,
  };
}
