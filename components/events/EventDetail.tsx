"use client";

import { useEffect } from "react";
import { ExternalLink, MapPinned, Navigation, X } from "lucide-react";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { FallbackArt } from "@/components/events/FallbackArt";
import { PriceBadge } from "@/components/events/PriceBadge";
import { CalendarAction } from "@/components/calendar/CalendarAction";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatCategoryLabel,
  formatDistanceMiles,
  formatEventDateTime,
} from "@/lib/events/format";
import type { EventCardData } from "@/components/events/EventCard";

export function EventDetail({
  event,
  userLocation,
  loading,
  onClose,
}: {
  event: EventCardData | null;
  userLocation?: { lat: number; lng: number } | null;
  loading?: boolean;
  onClose?: () => void;
}) {
  const experience = useExperience();

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (loading || !event) {
    return (
      <div className="relative">
        {onClose && (
          <CloseButton onClose={onClose} className="absolute right-0 top-0 z-10" />
        )}
        <EventDetailSkeleton />
      </div>
    );
  }

  const categoryLabel = formatCategoryLabel(
    event.category,
    experience.categories
  );
  const distance =
    event.latitude != null && event.longitude != null
      ? formatDistanceMiles(userLocation ?? null, {
          lat: event.latitude,
          lng: event.longitude,
        })
      : null;

  const mapsUrl =
    event.latitude != null && event.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`
      : event.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`
        : null;

  return (
    <article className="relative flex flex-col gap-4">
      {onClose && <CloseButton onClose={onClose} className="absolute right-0 top-0 z-10" />}

      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl">
        {event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <FallbackArt
            category={event.category}
            title={event.title}
            className="h-full w-full"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{categoryLabel}</Badge>
        <PriceBadge event={event} variant="detail" />
      </div>

      <h2 className="pr-10 text-2xl font-semibold tracking-tight leading-tight">
        {event.title}
      </h2>

      <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
        <p>
          {formatEventDateTime(event.starts_at, event.ends_at, event.timezone)}
        </p>
        {event.venue_name && (
          <p className="flex items-start gap-2 text-[var(--foreground)]">
            <MapPinned
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
              aria-hidden
            />
            <span>
              {event.venue_name}
              {event.address ? (
                <span className="block text-[var(--muted-foreground)]">
                  {event.address}
                </span>
              ) : null}
            </span>
          </p>
        )}
        {distance && <p>{distance}</p>}
      </div>

      {event.description && (
        <p className="text-sm leading-relaxed text-[var(--foreground)]/90">
          {event.description}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {mapsUrl && (
          <Button variant="secondary" asChild>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="h-4 w-4" aria-hidden />
              Directions
            </a>
          </Button>
        )}
        {event.source_url && (
          <Button variant="outline" asChild>
            <a href={event.source_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden />
              Website
            </a>
          </Button>
        )}
      </div>

      <CalendarAction event={event} className="w-full" />
    </article>
  );
}

function CloseButton({
  onClose,
  className,
}: {
  onClose: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close event details"
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]/95 text-[var(--foreground)] shadow-sm backdrop-blur hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${className ?? ""}`}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function EventDetailSkeleton() {
  return (
    <div
      className="space-y-4 animate-pulse"
      aria-busy="true"
      aria-label="Loading event"
    >
      <div className="aspect-[16/9] w-full rounded-xl bg-[var(--muted)]" />
      <div className="h-5 w-24 rounded bg-[var(--muted)]" />
      <div className="h-8 w-3/4 rounded bg-[var(--muted)]" />
      <div className="h-4 w-1/2 rounded bg-[var(--muted)]" />
      <div className="h-20 w-full rounded bg-[var(--muted)]" />
      <div className="h-12 w-full rounded bg-[var(--muted)]" />
    </div>
  );
}
