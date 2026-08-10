"use client";

import { LocateFixed, Undo2 } from "lucide-react";
import { searchAreaChipDisplayLabel } from "@/lib/events/filters";
import { cn } from "@/lib/utils";

/**
 * Interactive map/search-area context chip.
 * Viewport UX only — does not change search location or open Filters.
 */
export function SearchAreaChip({
  nearLabel,
  away,
  onRecenter,
  size = "md",
  className,
}: {
  /** Normal-state label, e.g. "Near Poway, CA" or "Near Poway, CA · 100 mi". */
  nearLabel: string;
  away: boolean;
  onRecenter: () => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const label = searchAreaChipDisplayLabel(nearLabel, away);
  const Icon = away ? Undo2 : LocateFixed;

  return (
    <button
      type="button"
      onClick={onRecenter}
      data-testid="search-area-chip"
      data-away={away ? "true" : "false"}
      aria-label={
        away
          ? `Return map to search area: ${nearLabel.replace(/^near\s+/i, "")}`
          : `Recenter map on search area: ${nearLabel.replace(/^near\s+/i, "")}`
      }
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/95 font-medium text-[var(--foreground)] shadow-sm backdrop-blur transition-colors",
        "cursor-pointer hover:border-[var(--accent)]/50 hover:bg-[var(--muted)]/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        className
      )}
    >
      <Icon
        className={cn(
          "shrink-0 text-[var(--muted-foreground)]",
          size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </button>
  );
}
