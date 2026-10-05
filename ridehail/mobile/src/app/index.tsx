import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import DriverHome from "@/screens/DriverHome";
import RiderHome from "@/screens/RiderHome";
import { useAuth } from "@/lib/auth";
import { APP_VARIANT } from "@/lib/config";

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  return APP_VARIANT === "driver" ? <DriverHome /> : <RiderHome />;
}
