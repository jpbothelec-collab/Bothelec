import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { Button, Card, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { APP_VARIANT } from "@/lib/config";
import { stopSharingLocation } from "@/lib/driverLocation";
import { api } from "@/lib/api";

export default function Account() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const signOut = async () => {
    if (APP_VARIANT === "driver") {
      await stopSharingLocation().catch(() => {});
      await api.setOnline(false).catch(() => {});
    }
    await logout();
    router.replace("/login");
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.pad, { gap: 12 }]}>
      <Card>
        <Text style={styles.h2}>{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username}</Text>
        <Text style={styles.body}>{user.email}</Text>
        <Text style={styles.body}>{user.phone}</Text>
        {user.driver && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.body}>{user.driver.vehicle}</Text>
            <Text style={styles.muted}>{user.driver.is_approved ? "Approved driver" : "Awaiting approval"}
              {user.driver.rating ? ` · ★ ${user.driver.rating}` : ""}</Text>
          </View>
        )}
      </Card>
      <Button title="Trip history" variant="secondary" onPress={() => router.push("/history")} />
      {APP_VARIANT === "driver" && (
        <Button title="Earnings" variant="secondary" onPress={() => router.push("/earnings")} />
      )}
      <Button testID="logout" title="Log out" variant="danger" onPress={signOut} />
    </ScrollView>
  );
}
