import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import Map from "@/components/Map";
import type { MapMarker } from "@/components/Map.types";
import { Button, Card, colors, ErrorText, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SharingMode, startSharingLocation, stopSharingLocation } from "@/lib/driverLocation";
import { money, trips } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import type { EarningsTotals, Point, Ride, RideRequestOffer } from "@/lib/types";

const JOHANNESBURG: Point = { lat: -26.2041, lng: 28.0473 };

export default function DriverHome() {
  const { user, setUser } = useAuth();
  const driver = user!.driver!;
  const [me, setMe] = useState<Point | null>(driver.lat != null && driver.lng != null ? { lat: driver.lat, lng: driver.lng } : null);
  const [mode, setMode] = useState<SharingMode | null>(null);
  const [offers, setOffers] = useState<RideRequestOffer[]>([]);
  const [current, setCurrent] = useState<Ride | null>(null);
  const [today, setToday] = useState<EarningsTotals | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const online = driver.is_online;

  const onMove = useCallback((lat: number, lng: number) => setMe({ lat, lng }), []);

  // App reopened while still online: resume sharing location.
  useEffect(() => {
    if (online) startSharingLocation(onMove).then(setMode).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(useCallback(() => {
    api.earnings().then((e) => setToday(e.today)).catch(() => {});
  }, []));

  usePolling(async () => {
    const { ride } = await api.activeRide();
    setCurrent(ride);
    if (!ride && online) setOffers((await api.offers()).requests);
    else setOffers([]);
  }, 4000, driver.is_approved);

  const toggleOnline = async () => {
    setBusy(true);
    setError("");
    try {
      if (online) {
        await stopSharingLocation();
        setUser(await api.setOnline(false));
        setMode(null);
        setOffers([]);
      } else {
        const sharing = await startSharingLocation(onMove);
        if (sharing === "denied") {
          setError("Allow location access to go online - riders need to see where you are.");
          return;
        }
        setMode(sharing);
        setUser(await api.setOnline(true));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't change status.");
    } finally {
      setBusy(false);
    }
  };

  const accept = async (id: number) => {
    setError("");
    try {
      await api.accept(id);
      router.push(`/ride/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't accept.");
      setOffers((o) => o.filter((x) => x.id !== id));
    }
  };

  const markers = useMemo<MapMarker[]>(() => [
    ...(me ? [{ id: "me", kind: "me" as const, title: "You", ...me }] : []),
    ...offers.map((o) => ({ id: `o${o.id}`, kind: "pickup" as const, lat: o.pickup_lat, lng: o.pickup_lng, title: money(o.fare) })),
  ], [me, offers]);

  return (
    <View style={styles.screen}>
      <Map center={me ?? JOHANNESBURG} markers={markers} />
      <ScrollView style={[styles.sheet, { maxHeight: "65%" }]}>
        <View style={[styles.row, { marginBottom: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h2}>Hi {user!.first_name || user!.username}</Text>
            <Text style={styles.muted} numberOfLines={1}>{driver.vehicle}{driver.rating ? ` · ★ ${driver.rating}` : ""}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.muted}>Today</Text>
            <Text style={[styles.h2, { marginBottom: 0 }]}>{money(today?.earnings)}</Text>
            <Text style={styles.muted}>{trips(today?.trips)}</Text>
          </View>
        </View>

        {!driver.is_approved ? (
          <Card style={{ backgroundColor: "#fef3c7" }}>
            <Text style={styles.body}>{"Your documents are being reviewed. You can go online once you're approved."}</Text>
          </Card>
        ) : current ? (
          <Pressable onPress={() => router.push(`/ride/${current.id}`)}>
            <Card style={{ backgroundColor: colors.black }}>
              <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>{current.status_label} ›</Text>
              <Text style={{ color: "#d1d5db" }} numberOfLines={1}>{current.pickup.address} → {current.dropoff.address}</Text>
            </Card>
          </Pressable>
        ) : (
          <>
            <Button testID="toggle-online" title={online ? "Go offline" : "Go online"} variant={online ? "danger" : "success"}
                    onPress={toggleOnline} loading={busy} />
            {online && mode === "foreground" && (
              <Text style={[styles.muted, { marginTop: 6 }]}>
                {"Tip: allow location “Always” so riders can track you while you use other apps."}
              </Text>
            )}
          </>
        )}
        <ErrorText>{error}</ErrorText>

        {online && !current && driver.is_approved && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.h2}>Ride requests</Text>
            {offers.length === 0 && <Text style={styles.muted}>Looking for riders near you…</Text>}
            {offers.map((o) => (
              <Card key={o.id} style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <Text style={[styles.h2, { marginBottom: 0 }]}>
                    {money(o.fare)}{o.surge !== "1.0" && <Text style={{ color: colors.amber }}> {o.surge}×</Text>}
                  </Text>
                  <Text style={styles.muted}>{o.km_away} km away · {o.payment}</Text>
                </View>
                <Text style={[styles.body, { marginVertical: 8 }]}>
                  <Text style={{ color: colors.green }}>● </Text>{o.pickup}{"\n"}
                  <Text style={{ color: colors.red }}>● </Text>{o.dropoff} ({o.trip_km} km)
                </Text>
                <Button testID={`accept-${o.id}`} title="Accept" onPress={() => accept(o.id)} />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
