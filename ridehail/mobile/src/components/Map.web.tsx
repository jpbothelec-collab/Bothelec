// Browser fallback for development: react-native-maps has no web support, so use Leaflet.
import "leaflet/dist/leaflet.css";

import type * as LeafletNS from "leaflet";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { MapProps, MARKER_COLORS } from "./Map.types";

export default function Map({ center, markers, route, fitKey, onPress, style }: MapProps) {
  const host = useRef<View>(null);
  const map = useRef<LeafletNS.Map | null>(null);
  const layer = useRef<LeafletNS.LayerGroup | null>(null);
  const L = useRef<typeof LeafletNS | null>(null);
  const pressRef = useRef(onPress);
  useEffect(() => {
    pressRef.current = onPress;
  });

  useEffect(() => {
    // Required lazily so nothing touches `window` during static rendering.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const leaflet: typeof LeafletNS = require("leaflet");
    L.current = leaflet;
    const el = host.current as unknown as HTMLElement;
    const m = leaflet.map(el).setView([center.lat, center.lng], 14);
    leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    m.on("click", (e: LeafletNS.LeafletMouseEvent) => pressRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    layer.current = leaflet.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const leaflet = L.current;
    if (!leaflet || !layer.current) return;
    layer.current.clearLayers();
    for (const mk of markers) {
      const size = mk.kind === "car" ? "width:22px;height:14px;border-radius:4px" : "width:18px;height:18px;border-radius:50%";
      leaflet.marker([mk.lat, mk.lng], {
        title: mk.title,
        icon: leaflet.divIcon({
          className: "",
          iconSize: [18, 18],
          html: `<div data-kind="${mk.kind}" style="${size};background:${MARKER_COLORS[mk.kind]};border:3px solid white;box-shadow:0 0 4px #0006"></div>`,
        }),
      }).addTo(layer.current);
    }
    if (route && route.length > 1) {
      leaflet.polyline(route.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#111827", dashArray: "6 8" }).addTo(layer.current);
    }
  }, [markers, route]);

  useEffect(() => {
    if (!fitKey || !map.current || markers.length < 2) return;
    map.current.fitBounds(markers.map((m) => [m.lat, m.lng] as [number, number]), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <View ref={host} style={[styles.map, style]} testID="map" />;
}

const styles = StyleSheet.create({ map: { flex: 1, minHeight: 200 } });
