"use client";

import { X } from "lucide-react";
import { formatOccurrenceLabel } from "@/lib/events/format";
import { normalizeDisplayText } from "@/lib/events/display-text";
import type { ClusterLeafEvent } from "@/lib/map/cluster-interaction";
import { clusterPickerHeading } from "@/lib/map/cluster-interaction";
import { cn } from "@/lib/utils";

export function ClusterEventPicker({
  events,
  onSelect,
  onClose,
  className,
}: {
  events: ClusterLeafEvent[];
  onSelect: (id: string) => void;
  onClose?: () => void;
  className?: string;
}) {
  const heading = clusterPickerHeading(events);
  const sorted = [...events].sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at)
  );

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      data-testid="cluster-event-picker"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Map cluster
          </p>
          <h2 className="truncate text-lg font-semibold tracking-tight">
            {heading}
          </h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cluster event list"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" role="list">
        {sorted.map((event) => {
          const title = normalizeDisplayText(event.title) ?? event.title;
          const when = formatOccurrenceLabel({
            starts_at: event.starts_at,
            ends_at: event.ends_at,
            timezone: event.timezone,
            all_day: event.all_day,
          });
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelect(event.id)}
                aria-label={`Open ${title}, ${when}`}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-left transition-colors hover:border-[var(--accent)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <p className="truncate font-medium leading-tight">{title}</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {when}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
