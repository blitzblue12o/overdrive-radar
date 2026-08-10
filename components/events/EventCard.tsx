"use client";

import { cn } from "@/lib/utils";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { FallbackArt } from "@/components/events/FallbackArt";
import { PriceBadge } from "@/components/events/PriceBadge";
import {
  cardVenueLabel,
  normalizeDisplayText,
} from "@/lib/events/display-text";
import { formatCategoryLabel, formatOccurrenceLabel } from "@/lib/events/format";
import type { EventFeatureProperties } from "@/lib/events/types";

export type EventCardData = EventFeatureProperties & {
  latitude?: number;
  longitude?: number;
};

export function EventCard({
  event,
  selected,
  onSelect,
  compact = false,
  recurrenceLabel,
}: {
  event: EventCardData;
  selected?: boolean;
  onSelect?: (id: string) => void;
  compact?: boolean;
  /** Presentation-only cadence hint (Weekly / Every 2 weeks / Multiple dates). */
  recurrenceLabel?: string | null;
}) {
  const experience = useExperience();
  const title = normalizeDisplayText(event.title) ?? event.title;
  const venueLabel = cardVenueLabel(event.venue_name, event.address);
  const categoryLabel = formatCategoryLabel(
    event.category,
    experience.categories
  );

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event.id)}
      aria-pressed={selected}
      aria-label={`${title}, ${categoryLabel}`}
      className={cn(
        "w-full text-left flex gap-3 rounded-lg border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        selected
          ? "border-[var(--accent)] bg-[var(--muted)]"
          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50"
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md",
          compact ? "h-14 w-14" : "h-16 w-16"
        )}
      >
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
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-medium leading-tight">{title}</p>
          <PriceBadge event={event} />
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">{categoryLabel}</p>
        <p className="text-xs text-[var(--muted-foreground)] truncate">
          {formatOccurrenceLabel({
            starts_at: event.starts_at,
            ends_at: event.ends_at,
            timezone: event.timezone,
            all_day: event.all_day,
          })}
        </p>
        {venueLabel ? (
          <p className="text-[11px] text-[var(--muted-foreground)]/80 truncate">
            {venueLabel}
          </p>
        ) : null}
        {recurrenceLabel ? (
          <p className="text-[11px] text-[var(--muted-foreground)]/80">
            {recurrenceLabel}
          </p>
        ) : null}
      </div>
    </button>
  );
}

export function EventCardSkeleton() {
  return (
    <div
      className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 animate-pulse"
      aria-hidden
    >
      <div className="h-16 w-16 rounded-md bg-[var(--muted)]" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 w-3/4 rounded bg-[var(--muted)]" />
        <div className="h-3 w-1/3 rounded bg-[var(--muted)]" />
        <div className="h-3 w-1/2 rounded bg-[var(--muted)]" />
      </div>
    </div>
  );
}
