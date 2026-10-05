import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import { api } from "./api";
import { EAS_PROJECT_ID } from "./config";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let currentToken: string | null = null;
export const getPushToken = () => currentToken;

/** Ask permission, get an Expo push token and register it with the backend. */
export async function registerForPush() {
  if (!Device.isDevice) return; // simulators can't receive pushes
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Ride updates",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return;
  if (!EAS_PROJECT_ID) {
    console.warn("Push disabled: set EAS_PROJECT_ID (run `eas init`).");
    return;
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
  currentToken = data;
  await api.registerDevice(data, Platform.OS);
}

/** Open the right screen when the user taps a notification. */
export function useNotificationRouting() {
  useEffect(() => {
    const open = (data: Record<string, unknown> | undefined) => {
      if (!data) return;
      if (data.kind === "ride_request") router.navigate("/");
      else if (typeof data.ride_id === "number") router.push(`/ride/${data.ride_id}`);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data));
    return () => sub.remove();
  }, []);
}
