"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { useExperience } from "@/components/experience/ExperienceProvider";

/** Mobile sheet states — preview removed; event-detail is full-screen split. */
export type SheetState = "collapsed" | "list" | "event-detail";

const DRAG_STATES: readonly SheetState[] = ["collapsed", "list"];

function sheetHeights(vh: number): Record<"collapsed" | "list", number> {
  return {
    collapsed: 52,
    list: Math.round(vh * 0.62),
  };
}

function nearestDragState(
  height: number,
  heights: Record<"collapsed" | "list", number>
): "collapsed" | "list" {
  return Math.abs(heights.list - height) < Math.abs(heights.collapsed - height)
    ? "list"
    : "collapsed";
}

export function MobileBottomSheet({
  state,
  onStateChange,
  eventCount,
  activeFilterCount = 0,
  nearLabel,
  list,
  eventDetail,
}: {
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  eventCount: number;
  /** When > 0, collapsed pill shows “· N filters”. */
  activeFilterCount?: number;
  /** e.g. "Near Thousand Oaks, CA" — omitted when location is unknown. */
  nearLabel?: string | null;
  list: ReactNode;
  /** Full-screen split: event info + listings (event-detail state only). */
  eventDetail: ReactNode;
}) {
  const experience = useExperience();
  const titleId = useId();
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    moved: boolean;
  } | null>(null);
  const heightsRef = useRef(sheetHeights(800));

  useEffect(() => {
    const update = () => {
      heightsRef.current = sheetHeights(window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const isEventDetail = state === "event-detail";
  const heightPx = isEventDetail
    ? "100%"
    : (dragHeight ?? heightsRef.current[state === "list" ? "list" : "collapsed"]);

  const endDrag = useCallback(
    (clientY: number) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || isEventDetail) return;
      const delta = drag.startY - clientY;
      const nextHeight = Math.max(
        heightsRef.current.collapsed,
        Math.min(heightsRef.current.list, drag.startHeight + delta)
      );
      setDragHeight(null);
      if (!drag.moved && Math.abs(delta) < 8) {
        if (state === "collapsed") onStateChange("list");
        else onStateChange("collapsed");
        return;
      }
      onStateChange(nearestDragState(nextHeight, heightsRef.current));
    },
    [isEventDetail, onStateChange, state]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (isEventDetail) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const startHeight =
      state === "list"
        ? heightsRef.current.list
        : heightsRef.current.collapsed;
    dragRef.current = {
      startY: e.clientY,
      startHeight,
      moved: false,
    };
    setDragHeight(startHeight);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || isEventDetail) return;
    const delta = dragRef.current.startY - e.clientY;
    if (Math.abs(delta) > 6) dragRef.current.moved = true;
    const next = Math.max(
      heightsRef.current.collapsed,
      Math.min(
        heightsRef.current.list,
        dragRef.current.startHeight + delta
      )
    );
    setDragHeight(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    endDrag(e.clientY);
  };

  const nearPrefix = nearLabel ? `${nearLabel} · ` : "";
  const collapsedLabel =
    activeFilterCount > 0
      ? `${nearPrefix}${eventCount} ${experience.theme.densityLabel} · ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} ↑`
      : `${nearPrefix}${eventCount} ${experience.theme.densityLabel} ↑`;

  // Keep list mounted under event-detail so scroll position is preserved on return.
  const showListPane = state === "list" || state === "event-detail";

  return (
    <div
      role="dialog"
      aria-modal={isEventDetail}
      aria-labelledby={titleId}
      className={cn(
        "pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col bg-[var(--card)] md:hidden",
        isEventDetail
          ? "inset-0 rounded-none border-0 shadow-none"
          : "rounded-t-2xl border border-[var(--border)] shadow-[0_-8px_30px_rgba(0,0,0,0.25)]",
        dragHeight == null &&
          !isEventDetail &&
          "transition-[height] duration-300 ease-out motion-reduce:transition-none"
      )}
      style={{ height: heightPx }}
    >
      <h2 id={titleId} className="sr-only">
        Events panel
      </h2>

      {!isEventDetail && (
        <div
          className="flex touch-none cursor-grab justify-center pt-2 pb-1 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="slider"
          aria-label="Drag to resize events panel"
          aria-valuemin={0}
          aria-valuemax={DRAG_STATES.length - 1}
          aria-valuenow={state === "list" ? 1 : 0}
          aria-valuetext={state}
        >
          <div className="h-1.5 w-12 rounded-full bg-[var(--border)]" />
        </div>
      )}

      {state === "collapsed" && (
        <button
          type="button"
          className="px-4 pb-3 text-sm font-medium text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          onClick={() => onStateChange("list")}
        >
          {collapsedLabel}
        </button>
      )}

      {showListPane && !isEventDetail && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">{list}</div>
      )}

      {isEventDetail && (
        <div className="flex min-h-0 flex-1 flex-col pt-[max(0.5rem,env(safe-area-inset-top))]">
          {eventDetail}
        </div>
      )}
    </div>
  );
}
