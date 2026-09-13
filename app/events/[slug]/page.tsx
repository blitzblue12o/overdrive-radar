import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublishedEventBySlugSuffix } from "@/lib/events/queries";
import { buildEventSlug, eventIdFromSlug } from "@/lib/events/slug";
import { buildEventJsonLd } from "@/lib/events/json-ld";
import {
  displayLocationLines,
  normalizeDisplayText,
  resolveEventWebsiteUrl,
} from "@/lib/events/display-text";
import { formatSourceLabel } from "@/lib/events/presentation";
import { formatOccurrenceDetailLines } from "@/lib/events/format";
import { isAbsoluteHttpUrl } from "@/lib/ingestion/urls";

export const dynamic = "force-dynamic";
export const revalidate = 300;

type PageProps = {
  params: Promise<{ slug: string }>;
};

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, "");
}

function formatRelativeUpdated(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Updated ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days}d ago`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const suffix = eventIdFromSlug(slug);
  if (!suffix) return { title: "Event" };
  const client = await createClient();
  const event = await getPublishedEventBySlugSuffix(
    client as unknown as import("@/lib/events/queries").EventsQueryClient,
    suffix
  );
  if (!event) return { title: "Event not found" };

  const title = normalizeDisplayText(event.title) ?? event.title;
  const description =
    normalizeDisplayText(event.description)?.slice(0, 160) ??
    `Event details for ${title} on Overdrive Radar.`;
  const canonicalPath = `/events/${buildEventSlug(event.title, event.id)}`;
  const canonical = `${siteOrigin()}${canonicalPath}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: "Overdrive Radar",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function EventPage({ params }: PageProps) {
  const { slug } = await params;
  const suffix = eventIdFromSlug(slug);
  if (!suffix) notFound();

  const client = await createClient();
  const event = await getPublishedEventBySlugSuffix(
    client as unknown as import("@/lib/events/queries").EventsQueryClient,
    suffix
  );
  if (!event) notFound();

  const title = normalizeDisplayText(event.title) ?? event.title;
  const canonicalPath = `/events/${buildEventSlug(event.title, event.id)}`;
  // Redirect-like: if slug doesn't match canonical, still render (stable by id).
  const { primary, secondary } = displayLocationLines(
    event.venue_name,
    event.address
  );
  const websiteUrl = resolveEventWebsiteUrl(event.source_url, event.description);
  const description = normalizeDisplayText(event.description);
  const sourceName =
    typeof event.source_metadata?.source_name === "string"
      ? formatSourceLabel(event.source_metadata.source_name)
      : null;
  const updatedLabel = formatRelativeUpdated(event.last_source_sync_at ?? null);
  const when = formatOccurrenceDetailLines({
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    timezone: event.timezone,
    all_day: event.all_day,
  });

  const mapsUrl =
    event.latitude != null && event.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`
      : primary
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [primary, secondary].filter(Boolean).join(", ")
          )}`
        : null;

  const experienceHref =
    event.experience === "overdrive" ? "/" : "/events";
  const jsonLd = buildEventJsonLd({
    id: event.id,
    title,
    description,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    timezone: event.timezone,
    venueName: primary,
    address: secondary ?? primary,
    latitude: event.latitude,
    longitude: event.longitude,
    sourceUrl: websiteUrl,
    imageUrl: event.image_url,
    canonicalUrl: `${siteOrigin()}${canonicalPath}`,
    isFree: event.is_free,
  });

  const reportMailto = `mailto:hello@overdriveradar.com?subject=${encodeURIComponent(
    `Report incorrect listing: ${title}`
  )}&body=${encodeURIComponent(
    `Event: ${title}\nURL: ${siteOrigin()}${canonicalPath}\n\nWhat's wrong?\n`
  )}`;

  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link
          href={experienceHref}
          className="inline-flex min-h-11 items-center text-sm text-[var(--muted-foreground)] underline-offset-4 hover:underline"
        >
          ← Back to map
        </Link>

        <header className="mt-6 space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <div className="space-y-1 text-[var(--muted-foreground)]">
            {when.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </header>

        {(primary || secondary) && (
          <section className="mt-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Location
            </h2>
            <p className="mt-1 text-base">{primary}</p>
            {secondary ? (
              <p className="text-sm text-[var(--muted-foreground)]">{secondary}</p>
            ) : null}
          </section>
        )}

        {description ? (
          <section className="mt-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              About
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">
              {description}
            </p>
          </section>
        ) : null}

        <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--foreground)] px-4 text-sm font-medium text-[var(--background)]"
            >
              Directions
            </a>
          ) : null}
          {websiteUrl && isAbsoluteHttpUrl(websiteUrl) ? (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-medium"
            >
              Event website
            </a>
          ) : null}
          <Link
            href={`${experienceHref}?event=${event.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-medium"
          >
            Open in map
          </Link>
        </section>

        {(sourceName || updatedLabel) && (
          <p className="mt-8 text-sm text-[var(--muted-foreground)]">
            {sourceName ? `Source: ${sourceName}` : null}
            {sourceName && updatedLabel ? " · " : null}
            {updatedLabel}
            {websiteUrl && isAbsoluteHttpUrl(websiteUrl) ? (
              <>
                {" · "}
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  Original listing
                </a>
              </>
            ) : null}
          </p>
        )}

        <p className="mt-6 text-sm">
          <a
            href={reportMailto}
            className="text-[var(--muted-foreground)] underline underline-offset-2"
          >
            Report incorrect listing
          </a>
        </p>
      </div>
    </main>
  );
}
