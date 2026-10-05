// One codebase, two store apps (like Uber / Uber Driver).
// Pick the app with APP_VARIANT=rider|driver (see package.json scripts and eas.json).
const VARIANT = process.env.APP_VARIANT === "driver" ? "driver" : "rider";

const VARIANTS = {
  rider: {
    name: "Bothelec Rides",
    slug: "bothelec-rides",
    scheme: "bothelecrides",
    bundleId: "za.co.bothelec.rides",
  },
  driver: {
    name: "Bothelec Driver",
    slug: "bothelec-driver",
    scheme: "bothelecdriver",
    bundleId: "za.co.bothelec.driver",
  },
};
const v = VARIANTS[VARIANT];

const locationPlugin =
  VARIANT === "driver"
    ? [
        "expo-location",
        {
          locationWhenInUsePermission: "Bothelec Driver uses your location to match you with nearby riders.",
          locationAlwaysAndWhenInUsePermission:
            "While you're online, Bothelec Driver shares your location in the background so riders can see you approaching and trips are measured accurately.",
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ]
    : [
        "expo-location",
        {
          locationWhenInUsePermission: "Bothelec Rides uses your location to set your pickup point.",
          locationAlwaysAndWhenInUsePermission: false,
          locationAlwaysPermission: false,
        },
      ];

module.exports = {
  expo: {
    name: v.name,
    slug: v.slug,
    scheme: v.scheme,
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    ios: {
      supportsTablet: false,
      bundleIdentifier: v.bundleId,
    },
    android: {
      package: v.bundleId,
      adaptiveIcon: {
        backgroundColor: "#000000",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      locationPlugin,
      ["expo-notifications", { color: "#000000" }],
      [
        "react-native-maps",
        {
          // Required for Google Maps on Android; iOS uses Apple Maps when unset.
          androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY,
          iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY,
        },
      ],
    ],
    extra: {
      appVariant: VARIANT,
      // Where the Django backend lives. Override with EXPO_PUBLIC_API_URL.
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000",
      // Fill in after `eas init` so push tokens can be issued.
      eas: { projectId: process.env.EAS_PROJECT_ID },
    },
  },
};
