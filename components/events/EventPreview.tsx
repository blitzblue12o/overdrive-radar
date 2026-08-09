"use client";

import { EventCard, type EventCardData } from "@/components/events/EventCard";
import { Button } from "@/components/ui/button";

export function EventPreview({
  event,
  onOpenDetail,
  onSelect,
}: {
  event: EventCardData;
  onOpenDetail: () => void;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <EventCard event={event} selected onSelect={onSelect} />
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={onOpenDetail}
        aria-label={`View details for ${event.title}`}
      >
        View details
      </Button>
    </div>
  );
}
