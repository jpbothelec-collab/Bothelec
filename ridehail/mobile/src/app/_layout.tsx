import "@/lib/driverLocation"; // registers the background location task at startup

import { Link, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { useNotificationRouting } from "@/lib/push";

function MenuLink() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Link href="/account" style={{ fontWeight: "600", fontSize: 16, paddingHorizontal: 8 }}>
      <Text>Menu</Text>
    </Link>
  );
}

function Navigator() {
  useNotificationRouting();
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontWeight: "700" }, headerRight: () => <MenuLink /> }}>
      <Stack.Screen name="index" options={{ title: APP_NAME }} />
      <Stack.Screen name="login" options={{ title: "Log in", headerRight: () => null }} />
      <Stack.Screen name="signup" options={{ title: "Sign up", headerRight: () => null }} />
      <Stack.Screen name="ride/[id]" options={{ title: "Your trip" }} />
      <Stack.Screen name="history" options={{ title: "Trips" }} />
      <Stack.Screen name="earnings" options={{ title: "Earnings" }} />
      <Stack.Screen name="account" options={{ title: "Account", headerRight: () => null }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Navigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
