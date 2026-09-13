import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { listPublicEventsForSitemap } from "@/lib/events/queries";
import { eventPath } from "@/lib/events/slug";
import { getSiteOrigin } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${origin}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${origin}/events`,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  try {
    const client = await createClient();
    const events = await listPublicEventsForSitemap(
      client as unknown as import("@/lib/events/queries").EventsQueryClient,
      2000
    );
    const eventRoutes: MetadataRoute.Sitemap = events.map((event) => ({
      url: `${origin}${eventPath(event.title, event.id)}`,
      lastModified: event.last_source_sync_at
        ? new Date(event.last_source_sync_at)
        : undefined,
      changeFrequency: "daily",
      priority: 0.7,
    }));
    return [...staticRoutes, ...eventRoutes];
  } catch {
    return staticRoutes;
  }
}
