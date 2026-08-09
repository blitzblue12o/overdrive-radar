"use client";

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
}) {
  if (loading) {
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
    if (filtersActive) {
      return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4 text-sm space-y-3">
          <div>
            <p className="font-medium">No events match these filters</p>
            <p className="mt-1 text-[var(--muted-foreground)]">
              Clear filters or expand the search distance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onClearFilters && (
              <Button type="button" variant="secondary" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            )}
            {onExpandDistance && canExpandDistance && (
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
      {events.map((event) => (
        <li key={event.id}>
          <EventCard
            event={event}
            selected={selectedEventId === event.id}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}
