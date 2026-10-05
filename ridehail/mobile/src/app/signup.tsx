import { Redirect } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Button, colors, ErrorText, Field, styles } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { APP_VARIANT } from "@/lib/config";

type FieldDef = { name: string; label: string; secure?: boolean; optional?: boolean; keyboard?: "email-address" | "phone-pad" };

const COMMON: FieldDef[] = [
  { name: "first_name", label: "First name" },
  { name: "last_name", label: "Last name" },
  { name: "email", label: "Email", keyboard: "email-address" },
  { name: "phone", label: "Mobile number", keyboard: "phone-pad" },
  { name: "username", label: "Username" },
  { name: "password1", label: "Password", secure: true },
  { name: "password2", label: "Confirm password", secure: true },
];

const DRIVER: FieldDef[] = [
  { name: "licence_number", label: "Driver's licence number" },
  { name: "prdp_number", label: "PrDP number", optional: true },
  { name: "operating_licence", label: "Operating licence", optional: true },
  { name: "vehicle_make", label: "Vehicle make" },
  { name: "vehicle_model", label: "Vehicle model" },
  { name: "vehicle_colour", label: "Vehicle colour" },
  { name: "vehicle_plate", label: "Number plate" },
];

const CLASSES = [["economy", "Economy"], ["comfort", "Comfort"], ["xl", "XL (6 seats)"]];

export default function Signup() {
  const { user, signup } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({ vehicle_class: "economy" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Redirect href="/" />;
  const isDriver = APP_VARIANT === "driver";
  const fields = isDriver ? [...COMMON, ...DRIVER] : COMMON;

  const submit = async () => {
    setBusy(true);
    setError("");
    setErrors({});
    try {
      await signup(values);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setErrors(e.fields ?? {});
      } else setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.pad, { maxWidth: 480, width: "100%", alignSelf: "center" }]}>
      <Text style={styles.h1}>{isDriver ? "Apply to drive" : "Create your account"}</Text>
      {isDriver && (
        <Text style={[styles.muted, { marginBottom: 16 }]}>
          We check your licence, PrDP and vehicle before you can go online.
        </Text>
      )}
      {fields.map((f) => (
        <Field
          key={f.name}
          label={f.label + (f.optional ? " (optional)" : "")}
          value={values[f.name] ?? ""}
          onChangeText={(t) => setValues((v) => ({ ...v, [f.name]: t }))}
          secureTextEntry={f.secure}
          keyboardType={f.keyboard}
          autoCapitalize={f.name.includes("name") || f.name.startsWith("vehicle") ? "words" : "none"}
          error={errors[f.name]?.join(" ")}
          testID={f.name}
        />
      ))}
      {isDriver && (
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.label}>Vehicle class</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {CLASSES.map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setValues((v) => ({ ...v, vehicle_class: key }))}
                style={[styles.input, { flex: 1, alignItems: "center" },
                  values.vehicle_class === key && { borderColor: colors.black, borderWidth: 2 }]}
              >
                <Text>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <ErrorText>{error}</ErrorText>
      <Button title={isDriver ? "Submit application" : "Sign up"} onPress={submit} loading={busy} testID="signup" />
    </ScrollView>
  );
}
