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
  displayDescriptionText,
  displayLocationLines,
  normalizeDisplayText,
  resolveEventWebsiteUrl,
} from "@/lib/events/display-text";
import {
  formatCategoryLabel,
  formatDistanceMiles,
  formatOccurrenceDetailLines,
} from "@/lib/events/format";
import type { RecurrencePresentation } from "@/lib/events/recurrence";
import type { EventCardData } from "@/components/events/EventCard";

function formatSiblingDateLabel(
  startsAt: string,
  timezone: string | null | undefined
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...(timezone ? { timeZone: timezone } : {}),
    month: "short",
    day: "numeric",
  }).format(new Date(startsAt));
}

export function EventDetail({
  event,
  userLocation,
  loading,
  onClose,
  recurrence,
  onSelectOccurrence,
}: {
  event: EventCardData | null;
  userLocation?: { lat: number; lng: number } | null;
  loading?: boolean;
  onClose?: () => void;
  /** Presentation-only; derived from the filtered result set. */
  recurrence?: RecurrencePresentation | null;
  onSelectOccurrence?: (id: string) => void;
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

  const title = normalizeDisplayText(event.title) ?? event.title;
  const { primary: locationPrimary, secondary: locationSecondary } =
    displayLocationLines(event.venue_name, event.address);
  const descriptionText = displayDescriptionText(event.description);
  const websiteUrl = resolveEventWebsiteUrl(
    event.source_url,
    event.description
  );

  const mapsUrl =
    event.latitude != null && event.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`
      : locationPrimary
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            locationSecondary
              ? `${locationPrimary}, ${locationSecondary}`
              : locationPrimary
          )}`
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
            title={title}
            className="h-full w-full"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{categoryLabel}</Badge>
        <PriceBadge event={event} variant="detail" />
      </div>

      <h2 className="pr-10 text-2xl font-semibold tracking-tight leading-tight">
        {title}
      </h2>

      {recurrence ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {recurrence.label}
        </p>
      ) : null}

      <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
        <div className="space-y-0.5">
          {formatOccurrenceDetailLines({
            starts_at: event.starts_at,
            ends_at: event.ends_at,
            timezone: event.timezone,
            all_day: event.all_day,
          }).map((line, i) => (
            <p
              key={`${i}-${line}`}
              className={line === "–" ? "leading-none opacity-70" : undefined}
            >
              {line}
            </p>
          ))}
        </div>
        {locationPrimary && (
          <p className="flex items-start gap-2 text-[var(--foreground)]">
            <MapPinned
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
              aria-hidden
            />
            <span>
              {locationPrimary}
              {locationSecondary ? (
                <span className="block text-[var(--muted-foreground)]">
                  {locationSecondary}
                </span>
              ) : null}
            </span>
          </p>
        )}
        {distance && <p>{distance}</p>}
      </div>

      {recurrence && recurrence.occurrenceCount > 1 ? (
        <div
          className="space-y-2"
          data-testid="recurrence-upcoming"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Upcoming dates
          </p>
          {recurrence.upcomingSiblings.length > 0 ? (
            <ul className="space-y-1.5">
              {recurrence.upcomingSiblings.map((sibling) => {
                const label = formatSiblingDateLabel(
                  sibling.starts_at,
                  sibling.timezone
                );
                return (
                  <li key={sibling.id}>
                    <button
                      type="button"
                      onClick={() => onSelectOccurrence?.(sibling.id)}
                      aria-label={`Open ${normalizeDisplayText(sibling.title) ?? sibling.title}, ${label}`}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--accent)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No later dates in this search
            </p>
          )}
          <p className="text-xs text-[var(--muted-foreground)]">
            {recurrence.occurrenceCount} dates in this search
          </p>
        </div>
      ) : null}

      {descriptionText && (
        <p className="text-sm leading-relaxed text-[var(--foreground)]/90">
          {descriptionText}
        </p>
      )}

      {(mapsUrl || websiteUrl) && (
        <div className="flex flex-wrap gap-2">
          {mapsUrl && (
            <Button variant="secondary" asChild>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-4 w-4" aria-hidden />
                Directions
              </a>
            </Button>
          )}
          {websiteUrl && (
            <Button variant="secondary" asChild>
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Website
              </a>
            </Button>
          )}
        </div>
      )}

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
