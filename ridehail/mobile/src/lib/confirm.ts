import { Alert, Platform } from "react-native";

/** Yes/no prompt that works on iOS, Android and web. */
export function confirm(title: string, message: string, confirmText = "OK"): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "No", style: "cancel", onPress: () => resolve(false) },
      { text: confirmText, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}
