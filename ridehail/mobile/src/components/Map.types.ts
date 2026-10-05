import type { StyleProp, ViewStyle } from "react-native";

import type { Point } from "@/lib/types";

export type MarkerKind = "pickup" | "dropoff" | "car" | "me";

export interface MapMarker extends Point {
  id: string;
  kind: MarkerKind;
  title?: string;
}

export interface MapProps {
  center: Point;
  markers: MapMarker[];
  /** Draw a line through these points (e.g. pickup → drop-off). */
  route?: Point[];
  /** Zoom to fit all markers whenever this key changes. */
  fitKey?: string;
  onPress?: (p: Point) => void;
  style?: StyleProp<ViewStyle>;
}

export const MARKER_COLORS: Record<MarkerKind, string> = {
  pickup: "#16a34a",
  dropoff: "#dc2626",
  car: "#111827",
  me: "#2563eb",
};
