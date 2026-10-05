/**
 * Driver GPS sharing. While online the driver app reports its position every
 * few seconds - in the background too (when the driver allows "Always"), via
 * an OS-managed location task, so tracking keeps working with the phone locked
 * or while using a navigation app.
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { api, TOKEN_KEY } from "./api";
import { storage } from "./storage";

export const LOCATION_TASK = "driver-location-updates";

// Must be defined at module scope so the OS can run it when the app is in the background.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const { latitude, longitude } = data.locations[data.locations.length - 1].coords;
  const token = await storage.get(TOKEN_KEY);
  if (!token) return;
  try {
    await api.sendLocation({ lat: latitude, lng: longitude }, token);
  } catch {
    // Next update will retry.
  }
});

let foregroundWatch: Location.LocationSubscription | null = null;
export type SharingMode = "background" | "foreground" | "denied";

export async function startSharingLocation(onUpdate?: (lat: number, lng: number) => void): Promise<SharingMode> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return "denied";

  const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  await api.sendLocation({ lat: here.coords.latitude, lng: here.coords.longitude }).catch(() => {});
  onUpdate?.(here.coords.latitude, here.coords.longitude);

  // The in-app map always gets live updates while the screen is open.
  foregroundWatch?.remove();
  foregroundWatch = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
    (loc) => onUpdate?.(loc.coords.latitude, loc.coords.longitude),
  );

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status === "granted") {
    if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 15,
        activityType: Location.ActivityType.AutomotiveNavigation,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "You're online",
          notificationBody: "Sharing your location with riders.",
          notificationColor: "#000000",
        },
      });
    }
    return "background";
  }

  // No "Always" permission: report from the foreground watcher instead.
  foregroundWatch.remove();
  foregroundWatch = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
    (loc) => {
      onUpdate?.(loc.coords.latitude, loc.coords.longitude);
      api.sendLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude }).catch(() => {});
    },
  );
  return "foreground";
}

export async function stopSharingLocation() {
  foregroundWatch?.remove();
  foregroundWatch = null;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
