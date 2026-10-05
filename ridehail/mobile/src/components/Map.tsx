import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import { MapProps, MARKER_COLORS } from "./Map.types";

const DELTA = { latitudeDelta: 0.04, longitudeDelta: 0.04 };

export default function Map({ center, markers, route, fitKey, onPress, style }: MapProps) {
  const ref = useRef<MapView>(null);

  useEffect(() => {
    if (!fitKey || markers.length < 2) return;
    ref.current?.fitToCoordinates(
      markers.map((m) => ({ latitude: m.lat, longitude: m.lng })),
      { edgePadding: { top: 80, right: 60, bottom: 80, left: 60 }, animated: true },
    );
    // Only refit when the caller says the set of points changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <MapView
      ref={ref}
      style={[styles.map, style]}
      initialRegion={{ latitude: center.lat, longitude: center.lng, ...DELTA }}
      onPress={(e) => onPress?.({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
      showsUserLocation
      showsMyLocationButton
    >
      {markers.map((m) => (
        <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lng }} title={m.title} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.dot, { backgroundColor: MARKER_COLORS[m.kind] }, m.kind === "car" && styles.car]} />
        </Marker>
      ))}
      {route && route.length > 1 && (
        <Polyline
          coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor="#111827"
          strokeWidth={3}
          lineDashPattern={[8, 8]}
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: "white" },
  car: { width: 22, height: 14, borderRadius: 4 },
});
