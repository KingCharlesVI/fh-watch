import { Stack, router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { changelog } from "@/state/whats-new";
import { Badge, Button, Card, Empty, Row, Screen, T } from "@/ui/kit";

/**
 * What's new: the changelog's entries, newest first. After an update it opens by itself with
 * `?new=N`, showing just the N entries since it last did; from Settings, all of them.
 */
export default function WhatsNewScreen() {
  const params = useLocalSearchParams<{ new?: string }>();
  const fresh = Number(params.new) || 0;
  const entries = fresh ? changelog.slice(0, fresh) : changelog;

  return (
    <Screen>
      <Stack.Screen options={{ title: fresh ? "What's new in this update" : "What's new" }} />
      {entries.length === 0 && <Empty icon="sparkles-outline" title="Nothing listed for this build" />}
      {entries.map((entry) => (
        <Card key={entry.version} title={`Version ${entry.version}`}>
          {entry.date && <T variant="small">{entry.date}</T>}
          {entry.sections.map((section) => (
            <View key={section.title} style={{ gap: 6 }}>
              <T variant="label">{section.title}</T>
              {section.items.map((item, i) => (
                <Row key={i} style={{ alignItems: "flex-start" }}>
                  <T style={{ flex: 1 }}>• {item.text}</T>
                  {item.area && <Badge label={item.area} />}
                </Row>
              ))}
            </View>
          ))}
        </Card>
      ))}
      {fresh > 0 && <Button title="Done" icon="checkmark" onPress={() => router.back()} />}
    </Screen>
  );
}
