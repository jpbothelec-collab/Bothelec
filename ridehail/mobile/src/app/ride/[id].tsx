import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, ScrollView, Text, View } from "react-native";

import Map from "@/components/Map";
import type { MapMarker } from "@/components/Map.types";
import { Button, Card, colors, ErrorText, Stars, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { APP_VARIANT } from "@/lib/config";
import { confirm } from "@/lib/confirm";
import { money, VEHICLE_LABELS } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { ACTIVE_STATUSES, Ride } from "@/lib/types";

const isDriver = APP_VARIANT === "driver";

const NEXT_STEP = {
  accepted: { action: "arrive", title: "I've arrived", variant: "primary" },
  arrived: { action: "start", title: "Start trip", variant: "success" },
  in_progress: { action: "complete", title: "Complete trip", variant: "danger" },
} as const;

function openNavigation(lat: number, lng: number) {
  const url = Platform.select({
    ios: `maps://?daddr=${lat},${lng}&dirflg=d`,
    android: `google.navigation:q=${lat},${lng}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
  });
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`));
}

export default function RideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rideId = Number(id);
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const active = !ride || ACTIVE_STATUSES.includes(ride.status);
  usePolling(async () => {
    try {
      setRide(await api.ride(rideId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setError(e.message);
    }
  }, 4000, active);

  const run = async (fn: () => Promise<Ride>) => {
    setBusy(true);
    setError("");
    try {
      setRide(await fn());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const markers = useMemo<MapMarker[]>(() => {
    if (!ride) return [];
    const list: MapMarker[] = [
      { id: "pickup", kind: "pickup", title: "Pickup", ...ride.pickup },
      { id: "dropoff", kind: "dropoff", title: "Drop-off", ...ride.dropoff },
    ];
    if (ride.driver?.lat != null && ride.driver.lng != null) {
      list.push({ id: "car", kind: "car", title: ride.driver.vehicle, lat: ride.driver.lat, lng: ride.driver.lng });
    }
    return list;
  }, [ride]);

  if (!ride) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator size="large" />}
      </View>
    );
  }

  const cancel = async () => {
    const fee = !isDriver && ride.status === "arrived" ? " A R25 cancellation fee applies." : "";
    if (await confirm("Cancel ride?", `Are you sure you want to cancel?${fee}`, "Cancel ride")) {
      run(() => api.cancel(ride.id));
    }
  };

  const other = isDriver ? ride.rider : ride.driver;
  const next = isDriver ? NEXT_STEP[ride.status as keyof typeof NEXT_STEP] : undefined;
  const navTarget = ride.status === "in_progress" ? ride.dropoff : ride.pickup;
  const myRating = isDriver ? ride.rating_for_rider : ride.rating_for_driver;
  const canCancel = ["requested", "accepted", "arrived"].includes(ride.status);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `Trip #${ride.id}` }} />
      <Map
        center={ride.pickup}
        markers={markers}
        route={[ride.pickup, ride.dropoff]}
        fitKey={`${ride.id}`}
      />
      <ScrollView style={[styles.sheet, { maxHeight: "62%" }]}>
        <Text testID="ride-status" style={styles.h1}>{ride.status_label}</Text>
        <Text style={styles.muted}>
          {VEHICLE_LABELS[ride.vehicle_class]} · {ride.payment_method === "cash" ? "Cash" : "Card"} · {ride.est_distance_km} km
        </Text>
        <Text style={[styles.body, { marginVertical: 10 }]}>
          <Text style={{ color: colors.green }}>● </Text>{ride.pickup.address}{"\n"}
          <Text style={{ color: colors.red }}>● </Text>{ride.dropoff.address}
        </Text>

        {ride.status === "requested" && (
          <View style={[styles.row, { justifyContent: "flex-start", gap: 10, marginBottom: 10 }]}>
            <ActivityIndicator />
            <Text style={styles.body}>Finding you a driver…</Text>
          </View>
        )}

        {other && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={[styles.body, { fontWeight: "700" }]}>
              {other.name}{!isDriver && ride.driver?.rating ? `  ★ ${ride.driver.rating}` : ""}
            </Text>
            {!isDriver && ride.driver && <Text style={styles.body}>{ride.driver.vehicle}</Text>}
            {other.phone ? (
              <Button title={`Call ${other.name}`} variant="secondary" style={{ marginTop: 10 }}
                      onPress={() => Linking.openURL(`tel:${other.phone}`)} />
            ) : null}
          </Card>
        )}

        {ride.final_fare ? (
          <View style={{ alignItems: "center", marginVertical: 8 }}>
            <Text testID="final-fare" style={{ fontSize: 36, fontWeight: "800" }}>{money(ride.final_fare)}</Text>
            {isDriver && <Text style={styles.body}>You earn {money(ride.driver_earnings)} (fee {money(ride.platform_fee)})</Text>}
            {ride.payment_method === "cash" && (
              <Text style={[styles.body, { marginTop: 6, color: colors.amber }]}>
                {isDriver ? "Collect" : "Pay"} {money(ride.final_fare)} in cash
              </Text>
            )}
          </View>
        ) : Number(ride.cancellation_fee) > 0 ? (
          <Text style={styles.body}>Cancellation fee: {money(ride.cancellation_fee)}</Text>
        ) : ride.status !== "cancelled" && ride.status !== "expired" ? (
          <Text style={styles.body}>
            Estimated fare <Text style={{ fontWeight: "700" }}>{money(ride.fare_estimate)}</Text>
            {ride.surge !== "1.0" && <Text style={{ color: colors.amber }}> ({ride.surge}× busy)</Text>}
          </Text>
        ) : null}

        <ErrorText>{error}</ErrorText>
        <View style={{ gap: 10, marginTop: 12, marginBottom: 24 }}>
          {next && (
            <>
              <Button testID="next-step" title={next.title} variant={next.variant} loading={busy}
                      onPress={() => run(() => api.advance(ride.id, next.action))} />
              <Button title={ride.status === "in_progress" ? "Navigate to drop-off" : "Navigate to pickup"}
                      variant="secondary" onPress={() => openNavigation(navTarget.lat, navTarget.lng)} />
            </>
          )}
          {canCancel && <Button testID="cancel" title="Cancel ride" variant="secondary" onPress={cancel} disabled={busy} />}

          {ride.status === "completed" && (
            <Card>
              <Text style={[styles.body, { textAlign: "center", marginBottom: 4 }]}>
                {myRating ? "Thanks for rating!" : `Rate your ${isDriver ? "rider" : "driver"}`}
              </Text>
              <Stars value={myRating} onChange={myRating ? undefined : (n) => run(() => api.rate(ride.id, n))} />
            </Card>
          )}
          {!ACTIVE_STATUSES.includes(ride.status) && (
            <Button testID="done" title="Done" onPress={() => router.replace("/")} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
