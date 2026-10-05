// Browser version (development only): foreground GPS while the tab is open.
import * as Location from "expo-location";

import { api } from "./api";

export type SharingMode = "background" | "foreground" | "denied";
let watch: Location.LocationSubscription | null = null;

export async function startSharingLocation(onUpdate?: (lat: number, lng: number) => void): Promise<SharingMode> {
  const fg = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (fg?.status !== "granted") return "denied";
  watch?.remove();
  watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 4000 }, (loc) => {
    onUpdate?.(loc.coords.latitude, loc.coords.longitude);
    api.sendLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude }).catch(() => {});
  });
  return "foreground";
}

export async function stopSharingLocation() {
  watch?.remove();
  watch = null;
}
