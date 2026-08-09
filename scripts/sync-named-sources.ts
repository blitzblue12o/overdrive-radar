/**
 * One-off manual sync for specific source names (Wave 3 verification).
 * Usage: npx tsx --tsconfig tsconfig.json scripts/sync-named-sources.ts
 */
import { loadEnvConfig } from "@next/env";
import { syncOneSource } from "@/lib/ingestion/sync";
import {
  createMapboxGeocoder,
  GeocodeCache,
} from "@/lib/ingestion/geocode";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { SourceRecord } from "@/lib/ingestion/types";

loadEnvConfig(process.cwd());

/** Override with SYNC_SOURCE_NAMES=comma,separated,names or edit this list. */
const NAMES = (
  process.env.SYNC_SOURCE_NAMES?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [
    "City of Escondido — City Events",
    "City of Poway — Community Events",
    "City of Coronado — Main Calendar",
    "City of Del Mar — Community Calendar",
    "City of Imperial Beach — Events Calendar",
    "City of La Mesa — Community Events",
    "City of Westlake Village — Main Calendar",
    "City of Malibu — Special Events",
  ]
);

async function main() {
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_MAPBOX_TOKEN",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }

  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("sources")
    .select(
      "id,name,experience,adapter_type,feed_url,active,default_category_overdrive,default_category_event_discovery"
    )
    .in("name", NAMES);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No matching sources found");

  const cache = new GeocodeCache(createMapboxGeocoder());
  for (const row of data as SourceRecord[]) {
    console.log(`Syncing: ${row.name}`);
    const result = await syncOneSource(client, row, cache, (msg, extra) => {
      console.log(`  ${msg}`, extra ?? "");
    });
    console.log(JSON.stringify(result));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
