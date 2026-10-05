import * as SecureStore from "expo-secure-store";

// AFTER_FIRST_UNLOCK so the driver's background location task can read the token
// while the phone is locked.
const OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const storage = {
  get: (key: string) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value, OPTIONS),
  remove: (key: string) => SecureStore.deleteItemAsync(key, OPTIONS),
};
