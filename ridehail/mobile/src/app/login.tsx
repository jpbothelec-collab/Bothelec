import { Link, Redirect } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";

import { Button, ErrorText, Field, styles } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { APP_NAME, APP_VARIANT } from "@/lib/config";

export default function Login() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Redirect href="/" />;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await login(username, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.screen, styles.pad]}>
      <View style={{ flex: 1, justifyContent: "center", maxWidth: 420, width: "100%", alignSelf: "center" }}>
        <Text style={[styles.h1, { fontSize: 32 }]}>{APP_NAME}</Text>
        <Text style={[styles.muted, { marginBottom: 24 }]}>
          {APP_VARIANT === "driver" ? "Drive and earn on your schedule." : "Get a ride in minutes."}
        </Text>
        <Field label="Username" value={username} onChangeText={setUsername} autoComplete="username" testID="username" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry
               autoComplete="password" onSubmitEditing={submit} testID="password" />
        <ErrorText>{error}</ErrorText>
        <Button title="Log in" onPress={submit} loading={busy} disabled={!username || !password} testID="login" />
        <Link href="/signup" style={{ textAlign: "center", marginTop: 20, fontWeight: "600" }}>
          <Text>{APP_VARIANT === "driver" ? "New driver? Apply to drive" : "New here? Create an account"}</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
