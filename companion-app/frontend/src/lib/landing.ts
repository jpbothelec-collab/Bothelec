// Data + helpers for SEO landing pages (city and category hubs).
// These pages exist to rank for searches like "companions in Cape Town" and
// to give crawlers clean, internally-linked entry points into the listings.

import type { CompanionshipCategory } from "./types";

export interface CityInfo {
  slug: string;
  /** Canonical display name, also used as the backend city query (partial,
   *  case-insensitive match). */
  name: string;
  /** Province, for copy + structured data. */
  province: string;
}

// Major South African metros first — the ones with real search volume.
export const CITIES: CityInfo[] = [
  { slug: "cape-town", name: "Cape Town", province: "Western Cape" },
  { slug: "johannesburg", name: "Johannesburg", province: "Gauteng" },
  { slug: "pretoria", name: "Pretoria", province: "Gauteng" },
  { slug: "durban", name: "Durban", province: "KwaZulu-Natal" },
  { slug: "sandton", name: "Sandton", province: "Gauteng" },
  { slug: "centurion", name: "Centurion", province: "Gauteng" },
  { slug: "port-elizabeth", name: "Gqeberha", province: "Eastern Cape" },
  { slug: "bloemfontein", name: "Bloemfontein", province: "Free State" },
  { slug: "east-london", name: "East London", province: "Eastern Cape" },
  { slug: "stellenbosch", name: "Stellenbosch", province: "Western Cape" },
  { slug: "nelspruit", name: "Mbombela", province: "Mpumalanga" },
  { slug: "polokwane", name: "Polokwane", province: "Limpopo" },
];

export function cityBySlug(slug: string): CityInfo | undefined {
  return CITIES.find((c) => c.slug === slug);
}

export interface CategoryInfo {
  slug: string;
  key: CompanionshipCategory;
  label: string;
  /** One-line intro used in the H1 sub-copy and meta description. */
  blurb: string;
}

export const CATEGORIES: CategoryInfo[] = [
  {
    slug: "dinner-dates",
    key: "dinner_date",
    label: "Dinner dates",
    blurb: "Poised company for restaurant dinners and evenings out.",
  },
  {
    slug: "event-plus-one",
    key: "event_plus_one",
    label: "Event plus-ones",
    blurb: "A polished plus-one for functions, galas and celebrations.",
  },
  {
    slug: "travel-companions",
    key: "travel_companion",
    label: "Travel companions",
    blurb: "Company for trips, getaways and business travel.",
  },
  {
    slug: "social-outings",
    key: "social_outing",
    label: "Social outings",
    blurb: "Relaxed company for daytime and social occasions.",
  },
];

export function categoryBySlug(slug: string): CategoryInfo | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
