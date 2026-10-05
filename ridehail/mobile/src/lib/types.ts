export type RideStatus =
  | "requested" | "accepted" | "arrived" | "in_progress" | "completed" | "cancelled" | "expired";

export interface Point { lat: number; lng: number }
export interface Place extends Point { address: string }

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "rider" | "driver" | null;
  phone: string;
  driver: null | {
    vehicle: string;
    vehicle_class: string;
    is_approved: boolean;
    is_online: boolean;
    rating: number | null;
    lat: number | null;
    lng: number | null;
  };
}

export interface Ride {
  id: number;
  status: RideStatus;
  status_label: string;
  vehicle_class: string;
  pickup: Place;
  dropoff: Place;
  est_distance_km: number;
  fare_estimate: string;
  final_fare: string | null;
  cancellation_fee: string;
  surge: string;
  payment_method: "cash" | "card";
  rating_for_driver: number | null;
  rating_for_rider: number | null;
  requested_at: string;
  driver: null | {
    name: string; phone: string; vehicle: string; rating: number | null;
    lat: number | null; lng: number | null;
  };
  rider: null | { name: string; phone: string };
  driver_earnings?: string;
  platform_fee?: string;
}

export interface QuoteOption {
  vehicle_class: string; label: string; seats: number; fare: string;
  surge: string; eta_min: number | null; drivers_nearby: number;
}
export interface Quote { distance_km: number; duration_min: number; currency: string; options: QuoteOption[] }

export interface RideRequestOffer {
  id: number; pickup: string; dropoff: string; pickup_lat: number; pickup_lng: number;
  km_away: number; trip_km: number; fare: string; surge: string; payment: string;
}

export interface EarningsTotals { fares: string; fees: string; earnings: string; trips: number }
export interface Earnings { today: EarningsTotals; all_time: EarningsTotals; rides: Ride[] }

export const ACTIVE_STATUSES: RideStatus[] = ["requested", "accepted", "arrived", "in_progress"];
