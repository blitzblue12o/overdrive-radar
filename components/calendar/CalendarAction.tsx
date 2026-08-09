"use client";

import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadIcs, type CalendarEventInput } from "@/lib/events/ics";

export function CalendarAction({
  event,
  className,
}: {
  event: CalendarEventInput;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="lg"
      className={className}
      onClick={() => downloadIcs(event)}
      aria-label={`Add ${event.title} to calendar`}
    >
      <CalendarPlus className="h-5 w-5" aria-hidden />
      Add to Calendar
    </Button>
  );
}
