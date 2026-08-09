import type { ExperienceId } from "@/lib/config/experiences";

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface EventRecord {
  id: string;
  experience: ExperienceId;
  overdrive_category: string | null;
  event_discovery_category: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  venue_name: string | null;
  address: string | null;
  is_free: boolean | null;
  price_amount: number | null;
  price_currency: string | null;
  latitude: number;
  longitude: number;
  image_url: string | null;
  source_url: string | null;
  organizer_name: string | null;
  event_status: string;
  publication_status: string;
  moderation_status: string;
}

export type EventFeatureProperties = {
  id: string;
  title: string;
  experience: ExperienceId;
  category: string | null;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  address: string | null;
  is_free: boolean | null;
  price_amount: number | null;
  price_currency: string | null;
  image_url: string | null;
  description: string | null;
  source_url: string | null;
  timezone: string | null;
};

export type EventFeature = GeoJSON.Feature<
  GeoJSON.Point,
  EventFeatureProperties
>;

export type EventFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  EventFeatureProperties
>;

export function eventToFeature(event: EventRecord): EventFeature {
  const category =
    event.experience === "overdrive"
      ? event.overdrive_category
      : event.event_discovery_category;

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [Number(event.longitude), Number(event.latitude)],
    },
    properties: {
      id: event.id,
      title: event.title,
      experience: event.experience,
      category,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      venue_name: event.venue_name,
      address: event.address,
      is_free: event.is_free,
      price_amount:
        event.price_amount === null || event.price_amount === undefined
          ? null
          : Number(event.price_amount),
      price_currency: event.price_currency,
      image_url: event.image_url,
      description: event.description,
      source_url: event.source_url,
      timezone: event.timezone,
    },
  };
}

export function eventsToFeatureCollection(
  events: EventRecord[]
): EventFeatureCollection {
  return {
    type: "FeatureCollection",
    features: events.map(eventToFeature),
  };
}

export function featureToEventLike(
  feature: EventFeature
): EventFeatureProperties & { latitude: number; longitude: number } {
  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    ...feature.properties,
    latitude,
    longitude,
  };
}
