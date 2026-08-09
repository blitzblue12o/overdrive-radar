import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getEvents,
  type EventsQueryClient,
} from "@/lib/events/queries";
import {
  parseCategoryParam,
  parseDistanceMiles,
  resolveDateRange,
} from "@/lib/events/filters";
import { eventsToFeatureCollection } from "@/lib/events/types";
import type { ExperienceId } from "@/lib/config/experiences";

function parseNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const experience = searchParams.get("experience") as ExperienceId | null;

  if (
    !experience ||
    (experience !== "overdrive" && experience !== "event_discovery")
  ) {
    return NextResponse.json(
      {
        error:
          "experience query param is required (overdrive | event_discovery)",
      },
      { status: 400 }
    );
  }

  const minLng = parseNumber(searchParams.get("minLng"));
  const minLat = parseNumber(searchParams.get("minLat"));
  const maxLng = parseNumber(searchParams.get("maxLng"));
  const maxLat = parseNumber(searchParams.get("maxLat"));

  if (minLng == null || minLat == null || maxLng == null || maxLat == null) {
    return NextResponse.json(
      { error: "minLng, minLat, maxLng, and maxLat are required" },
      { status: 400 }
    );
  }

  const q = searchParams.get("q")?.trim() || undefined;
  const dateParam = searchParams.get("date");
  const distanceMiles = parseDistanceMiles(searchParams.get("distance"));
  const categories = parseCategoryParam(searchParams.get("category"));
  const dateRange = resolveDateRange(dateParam);

  const centerLat = parseNumber(searchParams.get("centerLat"));
  const centerLng = parseNumber(searchParams.get("centerLng"));
  const center =
    centerLat != null && centerLng != null
      ? { lat: centerLat, lng: centerLng }
      : {
          lat: (minLat + maxLat) / 2,
          lng: (minLng + maxLng) / 2,
        };

  try {
    const supabase = createClient() as unknown as EventsQueryClient;
    const events = await getEvents(
      experience,
      {
        bbox: { minLng, minLat, maxLng, maxLat },
        query: q,
        dateRange: dateRange ?? undefined,
        distanceMiles: distanceMiles ?? undefined,
        categories: categories.length ? categories : undefined,
        center,
      },
      supabase
    );

    const isolated = events.filter((e) => e.experience === experience);
    return NextResponse.json(eventsToFeatureCollection(isolated));
  } catch {
    return NextResponse.json(
      { error: "Unable to load events" },
      { status: 500 }
    );
  }
}
