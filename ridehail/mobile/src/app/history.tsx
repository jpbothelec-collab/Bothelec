import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { colors, styles } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, money } from "@/lib/format";
import type { Ride } from "@/lib/types";

export default function History() {
  const [rides, setRides] = useState<Ride[] | null>(null);
  useFocusEffect(useCallback(() => {
    api.rides().then((r) => setRides(r.rides)).catch(() => setRides([]));
  }, []));

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.pad}
      data={rides ?? []}
      keyExtractor={(r) => String(r.id)}
      ListEmptyComponent={<Text style={styles.muted}>{rides ? "No trips yet." : "Loading…"}</Text>}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
      renderItem={({ item: r }) => (
        <Pressable onPress={() => router.push(`/ride/${r.id}`)} style={{ paddingVertical: 12 }}>
          <View style={styles.row}>
            <Text style={styles.muted}>{formatDate(r.requested_at)}</Text>
            <Text style={[styles.body, { fontWeight: "700" }]}>
              {r.final_fare ? money(r.final_fare) : Number(r.cancellation_fee) > 0 ? money(r.cancellation_fee) : "—"}
            </Text>
          </View>
          <Text style={styles.body} numberOfLines={1}>{r.pickup.address} → {r.dropoff.address}</Text>
          <Text style={styles.muted}>{r.status_label}</Text>
        </Pressable>
      )}
    />
  );
}
