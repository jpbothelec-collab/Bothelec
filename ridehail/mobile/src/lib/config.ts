import Constants from "expo-constants";

export type AppVariant = "rider" | "driver";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  appVariant?: AppVariant;
  apiUrl?: string;
  eas?: { projectId?: string };
};

export const APP_VARIANT: AppVariant = extra.appVariant === "driver" ? "driver" : "rider";
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || "http://localhost:8000").replace(/\/$/, "");
export const EAS_PROJECT_ID = extra.eas?.projectId;
export const APP_NAME = APP_VARIANT === "driver" ? "Bothelec Driver" : "Bothelec Rides";
