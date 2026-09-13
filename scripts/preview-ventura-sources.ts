/**
 * One-off fetch preview for Ventura Overdrive sources (no DB writes).
 * Usage: npx tsx --tsconfig tsconfig.json scripts/preview-ventura-sources.ts
 */
import { writeFileSync } from "fs";
import { HtmlSeriesAdapter } from "@/lib/ingestion/adapters/html-series";
import { TribeEventsAdapter } from "@/lib/ingestion/adapters/tribe-events";
import type { SourceRecord } from "@/lib/ingestion/types";

const sources: SourceRecord[] = [
  {
    id: "445ef556-1451-4f15-95ef-eb5ad6aa429f",
    name: "Camarillo Old Town Car Cruises",
    experience: "overdrive",
    adapter_type: "html_series",
    feed_url:
      "https://www.camarillomerchant.org/camarillo-old-town-car-cruises",
    active: true,
    default_category_overdrive: "drive_cruise",
    default_category_event_discovery: null,
    publication_policy: "probation",
  },
  {
    id: "f12db1e3-5d08-474d-9bf5-ed819700e184",
    name: "Ventura County Fairgrounds Events",
    experience: "overdrive",
    adapter_type: "tribe_events",
    feed_url: "https://venturacountyfair.org",
    active: true,
    default_category_overdrive: "car_show",
    default_category_event_discovery: null,
    publication_policy: "probation",
  },
  {
    id: "559b33b1-103e-4f30-8d8b-e1c48d0c7d45",
    name: "Conejo Valley Cars & Coffee",
    experience: "overdrive",
    adapter_type: "html_series",
    feed_url: "https://www.cvcarsandcoffee.com/",
    active: true,
    default_category_overdrive: "car_meet",
    default_category_event_discovery: null,
    publication_policy: "probation",
  },
  {
    id: "0273eb3b-8985-46b5-b224-a7f40cb0ff69",
    name: "Ventura Cars & Coffee",
    experience: "overdrive",
    adapter_type: "html_series",
    feed_url: "https://www.lacar.com/car-events-la/cars-and-coffee-ventura",
    active: true,
    default_category_overdrive: "car_meet",
    default_category_event_discovery: null,
    publication_policy: "probation",
  },
];

async function main() {
  const html = new HtmlSeriesAdapter();
  const tribe = new TribeEventsAdapter();
  const out: Record<string, unknown> = {};

  for (const source of sources) {
    const adapter =
      source.adapter_type === "tribe_events" ? tribe : html;
    const result = await adapter.fetchEvents(source);
    out[source.name] = {
      sourceId: source.id,
      fetched: result.events.length,
      feedNote: result.feedNote ?? null,
      events: result.events.map((e) => ({
        uid: e.uid,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        venueName: e.venueName ?? null,
        address: e.address ?? null,
        url: e.url ?? null,
        categories: e.categories ?? [],
        metadata: e.metadata ?? {},
        description: e.description ?? null,
        timezone: e.timezone ?? "America/Los_Angeles",
      })),
    };
    console.log(
      JSON.stringify({
        name: source.name,
        fetched: result.events.length,
        feedNote: result.feedNote,
        sample: result.events.slice(0, 3).map((e) => e.uid),
      })
    );
  }

  writeFileSync(
    "tmp-ventura-sync-preview.json",
    JSON.stringify(out, null, 2)
  );
  console.log("wrote tmp-ventura-sync-preview.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
