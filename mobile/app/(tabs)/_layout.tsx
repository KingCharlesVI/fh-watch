import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import { FONT, useColors } from "@/ui/theme";

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontFamily: FONT, fontWeight: "500" },
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        headerTitleStyle: { color: c.text, fontFamily: FONT, fontWeight: "600" },
        headerStyle: { backgroundColor: c.card, borderBottomColor: c.border, borderBottomWidth: 1 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Matches", tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
