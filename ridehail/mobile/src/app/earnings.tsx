import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { Card, colors, styles } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, money, trips } from "@/lib/format";
import type { Earnings as EarningsData, EarningsTotals } from "@/lib/types";

function Totals({ title, t }: { title: string; t: EarningsTotals }) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <Text style={styles.muted}>{title}</Text>
      <Text style={{ fontSize: 32, fontWeight: "800", color: colors.green }}>{money(t.earnings)}</Text>
      <Text style={styles.body}>{trips(t.trips)} · fares {money(t.fares)} · platform fee {money(t.fees)}</Text>
    </Card>
  );
}

export default function Earnings() {
  const [data, setData] = useState<EarningsData | null>(null);
  useFocusEffect(useCallback(() => {
    api.earnings().then(setData).catch(() => {});
  }, []));
  if (!data) return <Text style={[styles.pad, styles.muted]}>Loading…</Text>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Totals title="Today" t={data.today} />
      <Totals title="All time" t={data.all_time} />
      <Text style={styles.h2}>Recent trips</Text>
      {data.rides.map((r) => (
        <View key={r.id} style={[styles.row, { paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.body} numberOfLines={1}>{r.pickup.address} → {r.dropoff.address}</Text>
            <Text style={styles.muted}>{formatDate(r.requested_at)} · {r.status_label}</Text>
          </View>
          <Text style={[styles.body, { fontWeight: "700" }]}>{money(r.driver_earnings)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
