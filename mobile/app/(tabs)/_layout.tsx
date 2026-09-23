import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import { useColors } from "@/ui/theme";

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: c.primary, headerTitleStyle: { color: c.text } }}>
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
