"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useExperience } from "@/components/experience/ExperienceProvider";

export type SheetState = "collapsed" | "preview" | "list" | "detail";

const HEIGHT: Record<SheetState, string> = {
  collapsed: "3.25rem",
  preview: "11.5rem",
  list: "62vh",
  detail: "92vh",
};

export function MobileBottomSheet({
  state,
  onStateChange,
  eventCount,
  preview,
  list,
  detail,
}: {
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  eventCount: number;
  preview: ReactNode;
  list: ReactNode;
  detail: ReactNode;
}) {
  const experience = useExperience();
  const titleId = useId();

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={cn(
        "pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_-8px_30px_rgba(0,0,0,0.25)] transition-[height] duration-300 ease-out motion-reduce:transition-none md:hidden"
      )}
      style={{ height: HEIGHT[state] }}
    >
      <h2 id={titleId} className="sr-only">
        Events panel
      </h2>

      <div className="flex justify-center pt-2 pb-1">
        <button
          type="button"
          aria-label={
            state === "collapsed" ? "Expand event list" : "Collapse panel"
          }
          className="h-1.5 w-12 rounded-full bg-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          onClick={() => {
            if (state === "collapsed") onStateChange("list");
            else if (state === "detail") onStateChange("list");
            else if (state === "preview") onStateChange("collapsed");
            else onStateChange("collapsed");
          }}
        />
      </div>

      {state === "collapsed" && (
        <button
          type="button"
          className="px-4 pb-3 text-sm font-medium text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          onClick={() => onStateChange("list")}
        >
          {eventCount} {experience.theme.densityLabel} ↑
        </button>
      )}

      {state === "preview" && (
        <div className="overflow-y-auto px-3 pb-3">{preview}</div>
      )}

      {state === "list" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">{list}</div>
      )}

      {state === "detail" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{detail}</div>
      )}
    </div>
  );
}
