export type ExperienceId = "overdrive" | "event_discovery";

export type ThemeMode = "dark" | "light";

export interface CategoryOption {
  value: string;
  label: string;
}

export interface ExperienceTheme {
  mode: ThemeMode;
  accent: string;
  accentForeground: string;
  mapStyle: string;
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  card: string;
  densityLabel: string;
}

export interface ExperienceConfig {
  id: ExperienceId;
  name: string;
  route: string;
  theme: ExperienceTheme;
  searchPlaceholder: string;
  categories: CategoryOption[];
  fallbackArt: Record<string, string>;
  switcherLabel: string;
  switchTarget: ExperienceId;
}

export const overdriveConfig: ExperienceConfig = {
  id: "overdrive",
  name: "Overdrive",
  route: "/",
  searchPlaceholder: "Search car meets, events, or places",
  switcherLabel: "Explore EventDiscovery",
  switchTarget: "event_discovery",
  theme: {
    mode: "dark",
    accent: "#3B82F6",
    accentForeground: "#FFFFFF",
    mapStyle: "mapbox://styles/mapbox/dark-v11",
    background: "#0B1220",
    foreground: "#F8FAFC",
    muted: "#151D2E",
    mutedForeground: "#94A3B8",
    border: "#243044",
    card: "#111827",
    densityLabel: "car events nearby",
  },
  categories: [
    { value: "car_meet", label: "Car Meet" },
    { value: "car_show", label: "Car Show" },
    { value: "drive_cruise", label: "Drive / Cruise" },
    { value: "autocross", label: "Autocross" },
    { value: "track_event", label: "Track Event" },
    { value: "other", label: "Other" },
  ],
  fallbackArt: {
    car_meet: "car-meet",
    car_show: "car-show",
    drive_cruise: "drive-cruise",
    autocross: "autocross",
    track_event: "track-event",
    other: "other-auto",
  },
};

export const eventDiscoveryConfig: ExperienceConfig = {
  id: "event_discovery",
  name: "EventDiscovery",
  route: "/events",
  searchPlaceholder: "Search events, activities, or places",
  switcherLabel: "Explore Overdrive",
  switchTarget: "overdrive",
  theme: {
    mode: "light",
    accent: "#14B8A6",
    accentForeground: "#FFFFFF",
    mapStyle: "mapbox://styles/mapbox/light-v11",
    background: "#F8FAFB",
    foreground: "#0F172A",
    muted: "#FFFFFF",
    mutedForeground: "#64748B",
    border: "#E2E8F0",
    card: "#FFFFFF",
    densityLabel: "events nearby",
  },
  categories: [
    { value: "family", label: "Family" },
    { value: "community", label: "Community" },
    { value: "arts_and_culture", label: "Arts & Culture" },
    { value: "outdoor", label: "Outdoor" },
    { value: "food_and_markets", label: "Food & Markets" },
    { value: "entertainment", label: "Entertainment" },
    { value: "educational", label: "Educational" },
  ],
  fallbackArt: {
    family: "family",
    community: "community",
    arts_and_culture: "arts",
    outdoor: "outdoor",
    food_and_markets: "food",
    entertainment: "entertainment",
    educational: "educational",
  },
};

export function getExperienceConfig(id: ExperienceId): ExperienceConfig {
  return id === "overdrive" ? overdriveConfig : eventDiscoveryConfig;
}

export function getExperienceByRoute(pathname: string): ExperienceConfig {
  return pathname.startsWith("/events")
    ? eventDiscoveryConfig
    : overdriveConfig;
}
