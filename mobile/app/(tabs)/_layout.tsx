import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import { Pressable } from "react-native";
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
        // A plain button: no ripple (Android) when a tab is tapped.
        tabBarButton: ({ ref: _ref, href: _href, android_ripple: _ripple, pressColor: _color, pressOpacity: _opacity, hoverEffect: _hover, ...props }) => <Pressable {...props} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Matches", tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="upcoming"
        options={{ title: "Upcoming", tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="summary"
        options={{ title: "Summary", tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
