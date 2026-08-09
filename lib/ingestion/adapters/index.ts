import { IcsAdapter } from "@/lib/ingestion/adapters/ics";
import { RssAdapter } from "@/lib/ingestion/adapters/rss";
import { MotorsportRegAdapter } from "@/lib/ingestion/adapters/motorsportreg";
import type { AdapterType, SourceAdapter } from "@/lib/ingestion/types";

const adapters: Record<AdapterType, SourceAdapter> = {
  ics: new IcsAdapter(),
  rss: new RssAdapter(),
  motorsportreg: new MotorsportRegAdapter(),
};

export function getAdapter(type: AdapterType): SourceAdapter {
  const adapter = adapters[type];
  if (!adapter) {
    throw new Error(`Unknown adapter type: ${type}`);
  }
  return adapter;
}
