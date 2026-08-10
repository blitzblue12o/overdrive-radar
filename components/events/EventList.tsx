"use client";

import { useEffect, useRef } from "react";
import { EventCard, EventCardSkeleton, type EventCardData } from "@/components/events/EventCard";
import { Button } from "@/components/ui/button";

export function EventList({
  events,
  selectedEventId,
  onSelect,
  loading,
  error,
  filtersActive,
  onClearFilters,
  onExpandDistance,
  canExpandDistance,
  scrollSelectedIntoView = false,
  recurrenceLabelById,
}: {
  events: EventCardData[];
  selectedEventId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  filtersActive?: boolean;
  onClearFilters?: () => void;
  onExpandDistance?: () => void;
  canExpandDistance?: boolean;
  /** When true, scroll the selected card into view (event-detail listings). */
  scrollSelectedIntoView?: boolean;
  /** Presentation-only recurrence labels keyed by occurrence id. */
  recurrenceLabelById?: Map<string, string> | null;
}) {
  const selectedRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!scrollSelectedIntoView || !selectedEventId) return;
    selectedRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [scrollSelectedIntoView, selectedEventId, events]);

  // Only skeleton when we have nothing to show. Replacing an existing list with
  // short skeletons clamps the parent scroll container to the top.
  if (loading && events.length === 0) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading events">
        {Array.from({ length: 5 }).map((_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4 text-sm"
      >
        <p className="font-medium">Couldn’t load events</p>
        <p className="mt-1 text-[var(--muted-foreground)]">
          Something went wrong. Try again in a moment.
        </p>
      </div>
    );
  }

  if (events.length === 0) {
    const showExpand = Boolean(onExpandDistance && canExpandDistance);
    const showClear = Boolean(onClearFilters && filtersActive);

    if (filtersActive || showExpand) {
      return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4 text-sm space-y-3">
          <div>
            <p className="font-medium">
              {filtersActive
                ? "No events match these filters"
                : "No events in this area"}
            </p>
            <p className="mt-1 text-[var(--muted-foreground)]">
              {showExpand
                ? "Try expanding the search distance, or clear filters."
                : "Clear filters to see more nearby events."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showClear && (
              <Button type="button" variant="secondary" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            )}
            {showExpand && (
              <Button type="button" variant="outline" size="sm" onClick={onExpandDistance}>
                Expand distance
              </Button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4 text-sm">
        <p className="font-medium">No events in this area</p>
        <p className="mt-1 text-[var(--muted-foreground)]">
          Pan the map or zoom out to discover more nearby.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Events">
      {events.map((event) => {
        const selected = selectedEventId === event.id;
        return (
          <li key={event.id} ref={selected ? selectedRef : undefined}>
            <EventCard
              event={event}
              selected={selected}
              onSelect={onSelect}
              recurrenceLabel={recurrenceLabelById?.get(event.id) ?? null}
            />
          </li>
        );
      })}
    </ul>
  );
}
