import { ReactNode } from "react";
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle,
} from "react-native";

export const colors = {
  black: "#000000",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f9fafb",
  green: "#15803d",
  red: "#b91c1c",
  amber: "#b45309",
  white: "#ffffff",
};

type Variant = "primary" | "secondary" | "danger" | "success";

export function Button({ title, onPress, variant = "primary", disabled, loading, style, testID }: {
  title: string; onPress: () => void; variant?: Variant; disabled?: boolean; loading?: boolean;
  style?: ViewStyle; testID?: string;
}) {
  const bg = { primary: colors.black, secondary: colors.white, danger: colors.red, success: colors.green }[variant];
  const fg = variant === "secondary" ? colors.text : colors.white;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        variant === "secondary" && styles.buttonOutline,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        {...props}
        style={[styles.input, error ? { borderColor: colors.red } : null, props.style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return children ? <Text style={[styles.error, { marginBottom: 8 }]}>{children}</Text> : null;
}

export function Stars({ value, onChange }: { value?: number | null; onChange?: (n: number) => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange?.(n)} disabled={!onChange} accessibilityLabel={`${n} stars`}>
          <Text style={{ fontSize: 36, color: n <= (value ?? 0) ? "#f59e0b" : "#d1d5db" }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  h1: { fontSize: 26, fontWeight: "700", color: colors.text, marginBottom: 8 },
  h2: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 6 },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, backgroundColor: colors.white, color: colors.text,
  },
  error: { color: colors.red, fontSize: 13, marginTop: 2 },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  buttonOutline: { borderWidth: 1, borderColor: colors.border },
  buttonText: { fontSize: 16, fontWeight: "700" },
  card: {
    backgroundColor: colors.white, borderRadius: 14, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
});
