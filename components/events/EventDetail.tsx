"use client";

import { useEffect } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  MapPinned,
  Navigation,
  X,
} from "lucide-react";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { FallbackArt } from "@/components/events/FallbackArt";
import { PriceBadge } from "@/components/events/PriceBadge";
import { CalendarAction } from "@/components/calendar/CalendarAction";
import { Button } from "@/components/ui/button";
import {
  displayLocationLines,
  resolveEventWebsiteUrl,
} from "@/lib/events/display-text";
import {
  displayEventTitle,
  extractDescriptionParts,
  formatSourceLabel,
} from "@/lib/events/presentation";
import {
  formatCategoryLabel,
  formatDistanceMiles,
  formatOccurrenceDetailLines,
} from "@/lib/events/format";
import { eventPath } from "@/lib/events/slug";
import { AnalyticsEvents, trackProductEvent } from "@/lib/analytics/track";
import type { RecurrencePresentation } from "@/lib/events/recurrence";
import type { EventCardData } from "@/components/events/EventCard";
import Link from "next/link";

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
  const sourceLabel = formatSourceLabel(event.source_key);
  const distance =
    event.latitude != null && event.longitude != null
      ? formatDistanceMiles(userLocation ?? null, {
          lat: event.latitude,
          lng: event.longitude,
        })
      : null;

  const title = displayEventTitle(event.title, event.source_key);
  const { primary: locationPrimary, secondary: locationSecondary } =
    displayLocationLines(event.venue_name, event.address);
  const { prose: descriptionProse, links: descriptionLinks } =
    extractDescriptionParts(event.description);
  const websiteUrl = resolveEventWebsiteUrl(
    event.source_url,
    event.description
  );
  const namedLinks = websiteUrl
    ? descriptionLinks.filter(
        (link) => link.href.toLowerCase() !== websiteUrl.toLowerCase()
      )
    : descriptionLinks;

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

  const whenLines = formatOccurrenceDetailLines({
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    timezone: event.timezone,
    all_day: event.all_day,
  }).filter((line) => line !== "–");

  const updatedLabel = formatRelativeUpdated(event.last_source_sync_at);
  const sharePath = eventPath(event.title, event.id);

  return (
    <article className="relative flex flex-col gap-5">
      {onClose && (
        <CloseButton onClose={onClose} className="absolute right-0 top-0 z-10" />
      )}

      {/* Compact category / image hero */}
      <div className="relative w-full overflow-hidden rounded-xl">
        {event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.image_url}
            alt=""
            className="aspect-[21/9] max-h-36 w-full object-cover sm:max-h-40"
          />
        ) : (
          <FallbackArt
            category={event.category}
            title={title}
            sourceLabel={sourceLabel}
            variant="hero"
            className="aspect-[21/9] max-h-36 w-full sm:max-h-40"
          />
        )}
      </div>

      {/* Title + category · source */}
      <header className="space-y-2 pr-10">
        <div className="flex flex-wrap items-center gap-2">
          <PriceBadge event={event} variant="detail" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight leading-snug sm:text-[1.35rem] break-words">
          {title}
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          {categoryLabel}
          {sourceLabel ? ` · ${sourceLabel}` : ""}
        </p>
        {sourceLabel || updatedLabel ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            {sourceLabel ? `Source: ${sourceLabel}` : null}
            {sourceLabel && updatedLabel ? " · " : null}
            {updatedLabel}
          </p>
        ) : null}
        {recurrence ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            {recurrence.label}
          </p>
        ) : null}
      </header>

      {/* Date / location metadata */}
      <div className="space-y-2.5 text-sm">
        <div className="flex items-start gap-2.5 text-[var(--foreground)]">
          <CalendarDays
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
            aria-hidden
          />
          <div className="min-w-0 space-y-0.5">
            {whenLines.map((line, i) => (
              <p key={`${i}-${line}`} className="leading-snug">
                {line}
              </p>
            ))}
          </div>
        </div>
        {locationPrimary && (
          <div className="flex items-start gap-2.5 text-[var(--foreground)]">
            <MapPinned
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="leading-snug">{locationPrimary}</p>
              {locationSecondary ? (
                <p className="mt-0.5 text-[var(--muted-foreground)] leading-snug break-words">
                  {locationSecondary}
                </p>
              ) : null}
            </div>
          </div>
        )}
        {distance ? (
          <p className="pl-[1.625rem] text-xs text-[var(--muted-foreground)]">
            {distance} away
          </p>
        ) : null}
      </div>

      {recurrence && recurrence.occurrenceCount > 1 ? (
        <div className="space-y-2" data-testid="recurrence-upcoming">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
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
                      aria-label={`Open ${displayEventTitle(sibling.title)}, ${label}`}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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

      {descriptionProse ? (
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            About this event
          </h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)]/90">
            {descriptionProse}
          </p>
        </section>
      ) : null}

      {namedLinks.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Links
          </h3>
          <ul className="space-y-1.5">
            {namedLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex max-w-full items-center gap-1.5 break-words text-sm font-medium text-[var(--accent)] underline-offset-2 transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <span className="min-w-0">{link.label}</span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 shrink-0 opacity-70"
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Action hierarchy: Calendar → Directions → Website */}
      <div className="flex flex-col gap-2.5 pt-1">
        <div
          onClick={() => {
            void trackProductEvent(AnalyticsEvents.calendarClicked, {
              experience: event.experience,
            });
          }}
        >
          <CalendarAction event={event} className="w-full min-h-11" />
        </div>
        {(mapsUrl || websiteUrl) && (
          <div className="flex flex-wrap gap-2">
            {mapsUrl && (
              <Button variant="secondary" asChild className="min-h-11">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void trackProductEvent(AnalyticsEvents.directionsClicked, {
                      experience: event.experience,
                    });
                  }}
                >
                  <Navigation className="h-4 w-4" aria-hidden />
                  Directions
                </a>
              </Button>
            )}
            {websiteUrl && (
              <Button variant="outline" asChild className="min-h-11">
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void trackProductEvent(AnalyticsEvents.websiteClicked, {
                      experience: event.experience,
                    });
                  }}
                >
                  Event Website
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              </Button>
            )}
          </div>
        )}
        <Link
          href={sharePath}
          className="text-xs text-[var(--muted-foreground)] underline underline-offset-2"
        >
          Open shareable event page
        </Link>
        <a
          href={`mailto:hello@overdriveradar.com?subject=${encodeURIComponent(
            `Report incorrect listing: ${title}`
          )}`}
          className="text-xs text-[var(--muted-foreground)] underline underline-offset-2"
        >
          Report incorrect listing
        </a>
      </div>
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
      className={`flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]/95 text-[var(--foreground)] backdrop-blur transition-colors duration-150 hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${className ?? ""}`}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function EventDetailSkeleton() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Loading event"
    >
      <div className="aspect-[21/9] max-h-36 w-full rounded-xl bg-[var(--muted)]" />
      <div className="space-y-2">
        <div className="h-6 w-3/4 rounded bg-[var(--muted)]" />
        <div className="h-3.5 w-1/3 rounded bg-[var(--muted)]" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-1/2 rounded bg-[var(--muted)]" />
        <div className="h-4 w-2/3 rounded bg-[var(--muted)]" />
      </div>
      <div className="h-16 w-full rounded bg-[var(--muted)]" />
      <div className="h-12 w-full rounded-md bg-[var(--muted)]" />
    </div>
  );
}
