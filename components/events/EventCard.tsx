"use client";

import { CalendarDays, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { CategoryIcon } from "@/components/events/CategoryIcon";
import { PriceBadge } from "@/components/events/PriceBadge";
import {
  cardLocationLabel,
  displayEventTitle,
  formatSourceLabel,
} from "@/lib/events/presentation";
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
  const title = displayEventTitle(event.title, event.source_key);
  const sourceLabel = formatSourceLabel(event.source_key);
  const venueLabel = cardLocationLabel(event.venue_name, event.address);
  const categoryLabel = formatCategoryLabel(
    event.category,
    experience.categories
  );
  const when = formatOccurrenceLabel({
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    timezone: event.timezone,
    all_day: event.all_day,
  });

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event.id)}
      aria-pressed={selected}
      aria-label={`${title}, ${categoryLabel}`}
      className={cn(
        "group relative w-full text-left flex gap-2.5 rounded-lg border px-2.5 py-2.5 transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        selected
          ? "border-[var(--accent)]/70 bg-[var(--muted)] shadow-[inset_3px_0_0_0_var(--accent)]"
          : "border-transparent bg-[var(--card)] hover:bg-[var(--muted)]/70"
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-white/5",
          compact ? "h-11 w-11" : "h-12 w-12",
          selected && "ring-[var(--accent)]/40"
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
          <div
            className={cn(
              "flex h-full w-full items-center justify-center",
              selected ? "bg-[var(--accent)]/15" : "bg-[var(--muted)]"
            )}
          >
            <CategoryIcon
              category={event.category}
              className={cn(
                "h-5 w-5",
                selected
                  ? "text-[var(--accent)]"
                  : "text-[var(--muted-foreground)]"
              )}
            />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[0.9375rem] font-semibold leading-snug tracking-tight">
            {title}
          </p>
          <PriceBadge event={event} />
        </div>
        <p className="truncate text-[11px] text-[var(--muted-foreground)]">
          {categoryLabel}
          {sourceLabel ? ` · ${sourceLabel}` : ""}
        </p>
        <p className="flex items-center gap-1 truncate text-[11px] text-[var(--muted-foreground)]">
          <CalendarDays className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{when}</span>
        </p>
        {venueLabel ? (
          <p className="flex items-center gap-1 truncate text-[11px] text-[var(--muted-foreground)]/85">
            <MapPin className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">{venueLabel}</span>
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
      className="flex gap-2.5 rounded-lg border border-transparent bg-[var(--card)] px-2.5 py-2.5"
      aria-hidden
    >
      <div className="h-12 w-12 shrink-0 rounded-md bg-[var(--muted)]" />
      <div className="flex-1 space-y-1.5 py-0.5">
        <div className="h-3.5 w-3/4 rounded bg-[var(--muted)]" />
        <div className="h-2.5 w-1/3 rounded bg-[var(--muted)]" />
        <div className="h-2.5 w-1/2 rounded bg-[var(--muted)]" />
        <div className="h-2.5 w-2/5 rounded bg-[var(--muted)]" />
      </div>
    </div>
  );
}
