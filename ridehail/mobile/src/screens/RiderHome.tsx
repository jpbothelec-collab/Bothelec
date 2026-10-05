import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import Map from "@/components/Map";
import type { MapMarker } from "@/components/Map.types";
import { Button, colors, ErrorText, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { reverseGeocode, searchPlaces } from "@/lib/geocode";
import { usePolling } from "@/lib/usePolling";
import type { Place, Point, Quote } from "@/lib/types";

const JOHANNESBURG: Point = { lat: -26.2041, lng: 28.0473 };

export default function RiderHome() {
  const [center, setCenter] = useState<Point | null>(null);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  // Keyed by the trip it was quoted for, so a stale quote is never shown.
  const [quoted, setQuoted] = useState<{ key: string; quote: Quote } | null>(null);
  const [choice, setChoice] = useState("economy");
  const [payment, setPayment] = useState<"cash" | "card">("cash");
  const [cars, setCars] = useState<Point[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already on a trip? Go straight to it.
  useFocusEffect(useCallback(() => {
    api.activeRide().then(({ ride }) => ride && router.replace(`/ride/${ride.id}`)).catch(() => {});
  }, []));

  // Start with pickup at the rider's current location, like Uber.
  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (perm?.status !== "granted") {
        setCenter(JOHANNESBURG);
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(here);
        setPickup({ ...here, address: "Current location" });
        setPickup({ ...here, address: await reverseGeocode(here.lat, here.lng) });
      } catch {
        setCenter(JOHANNESBURG);
      }
    })();
  }, []);

  // Address search, debounced.
  useEffect(() => {
    const t = setTimeout(async () => setResults(await searchPlaces(query, pickup ?? undefined)), 500);
    return () => clearTimeout(t);
  }, [query, pickup]);

  // Prices for every class once both ends are set.
  const tripKey = pickup && dropoff ? `${pickup.lat},${pickup.lng},${dropoff.lat},${dropoff.lng}` : null;
  useEffect(() => {
    if (!pickup || !dropoff || !tripKey) return;
    api.quote(pickup, dropoff)
      .then((quote) => setQuoted({ key: tripKey, quote }))
      .catch((e) => setError(e.message));
  }, [tripKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const quote = quoted && quoted.key === tripKey ? quoted.quote : null;

  usePolling(async () => {
    const p = pickup ?? center;
    if (p) setCars((await api.nearbyDrivers(p)).drivers);
  }, 10000, !!(pickup ?? center));

  const onMapPress = async (p: Point) => {
    const place = { ...p, address: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` };
    const setter = pickup ? setDropoff : setPickup;
    setter(place);
    setter({ ...p, address: await reverseGeocode(p.lat, p.lng) });
  };

  const choose = (place: Place) => {
    setDropoff(place);
    setQuery("");
    setResults([]);
  };

  const requestRide = async () => {
    if (!pickup || !dropoff) return;
    setBusy(true);
    setError("");
    try {
      const ride = await api.requestRide({ pickup, dropoff, vehicle_class: choice, payment_method: payment });
      router.push(`/ride/${ride.id}`);
      setDropoff(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't request a ride.");
    } finally {
      setBusy(false);
    }
  };

  const markers = useMemo<MapMarker[]>(() => [
    ...cars.map((c, i) => ({ id: `car${i}`, kind: "car" as const, ...c })),
    ...(pickup ? [{ id: "pickup", kind: "pickup" as const, title: "Pickup", ...pickup }] : []),
    ...(dropoff ? [{ id: "dropoff", kind: "dropoff" as const, title: "Drop-off", ...dropoff }] : []),
  ], [cars, pickup, dropoff]);

  if (!center) {
    return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.screen}>
      <Map
        center={center}
        markers={markers}
        route={pickup && dropoff ? [pickup, dropoff] : undefined}
        fitKey={pickup && dropoff ? `${pickup.lat},${dropoff.lat}` : undefined}
        onPress={onMapPress}
      />
      <ScrollView style={[styles.sheet, { maxHeight: "60%" }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.h2}>Where to?</Text>
        <PlaceRow dot={colors.green} text={pickup?.address ?? "Tap the map to set your pickup"}
               onClear={pickup ? () => { setPickup(null); setDropoff(null); } : undefined} />
        {dropoff ? (
          <PlaceRow dot={colors.red} text={dropoff.address} onClear={() => setDropoff(null)} />
        ) : (
          <TextInput
            testID="destination"
            style={[styles.input, { marginTop: 8 }]}
            placeholder="Search destination or tap the map"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
          />
        )}
        {results.map((r) => (
          <Pressable key={`${r.lat},${r.lng}`} onPress={() => choose(r)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }}>
            <Text style={styles.body}>{r.address}</Text>
          </Pressable>
        ))}

        {pickup && dropoff && !quote && <ActivityIndicator style={{ marginTop: 12 }} />}
        {quote && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.muted}>{quote.distance_km} km · about {Math.round(quote.duration_min)} min</Text>
            {quote.options.map((o) => (
              <Pressable
                key={o.vehicle_class}
                testID={`class-${o.vehicle_class}`}
                onPress={() => setChoice(o.vehicle_class)}
                style={[styles.row, {
                  padding: 12, marginTop: 8, borderRadius: 10, borderWidth: choice === o.vehicle_class ? 2 : 1,
                  borderColor: choice === o.vehicle_class ? colors.black : colors.border,
                }]}
              >
                <View>
                  <Text style={[styles.body, { fontWeight: "700" }]}>{o.label} <Text style={styles.muted}>· {o.seats} seats</Text></Text>
                  <Text style={styles.muted}>{o.eta_min ? `${o.eta_min} min away` : "No cars nearby"}</Text>
                </View>
                <Text style={[styles.body, { fontWeight: "700" }]}>
                  {money(o.fare)}{o.surge !== "1.0" && <Text style={{ color: colors.amber }}> {o.surge}×</Text>}
                </Text>
              </Pressable>
            ))}
            <View style={[styles.row, { marginVertical: 12, gap: 8 }]}>
              {(["cash", "card"] as const).map((m) => (
                <Pressable key={m} onPress={() => setPayment(m)}
                  style={[styles.input, { flex: 1, alignItems: "center" }, payment === m && { borderColor: colors.black, borderWidth: 2 }]}>
                  <Text>{m === "cash" ? "💵 Cash" : "💳 Card"}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        <ErrorText>{error}</ErrorText>
        {quote && (
          <Button testID="request" title={`Request ${quote.options.find((o) => o.vehicle_class === choice)?.label ?? ""}`}
                  onPress={requestRide} loading={busy} style={{ marginBottom: 24 }} />
        )}
      </ScrollView>
    </View>
  );
}

function PlaceRow({ dot, text, onClear }: { dot: string; text: string; onClear?: () => void }) {
  return (
    <View style={[styles.row, { paddingVertical: 6 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot, marginRight: 10 }} />
        <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>{text}</Text>
      </View>
      {onClear && <Pressable onPress={onClear} hitSlop={10}><Text style={styles.muted}>✕</Text></Pressable>}
    </View>
  );
}
