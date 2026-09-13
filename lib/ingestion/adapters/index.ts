import { HtmlSeriesAdapter } from "@/lib/ingestion/adapters/html-series";
import { IcsAdapter } from "@/lib/ingestion/adapters/ics";
import { LibraryCalendarAdapter } from "@/lib/ingestion/adapters/librarycalendar";
import { RssAdapter } from "@/lib/ingestion/adapters/rss";
import { MotorsportRegAdapter } from "@/lib/ingestion/adapters/motorsportreg";
import { TribeEventsAdapter } from "@/lib/ingestion/adapters/tribe-events";
import type { AdapterType, SourceAdapter } from "@/lib/ingestion/types";

const adapters: Record<AdapterType, SourceAdapter> = {
  ics: new IcsAdapter(),
  rss: new RssAdapter(),
  motorsportreg: new MotorsportRegAdapter(),
  librarycalendar: new LibraryCalendarAdapter(),
  tribe_events: new TribeEventsAdapter(),
  html_series: new HtmlSeriesAdapter(),
};

export function getAdapter(type: AdapterType): SourceAdapter {
  const adapter = adapters[type];
  if (!adapter) {
    throw new Error(`Unknown adapter type: ${type}`);
  }
  return adapter;
}
