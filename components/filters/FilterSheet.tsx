"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  dateChipToParam,
  dateParamToChip,
  parseCategoryParam,
  parseDistanceMiles,
} from "@/lib/events/filters";
import { cn } from "@/lib/utils";

const DATE_CHIPS = ["Today", "Tomorrow", "This Weekend", "Pick a Date"] as const;
const DISTANCE_CHIPS = ["10 mi", "25 mi", "50 mi", "100 mi"] as const;

export interface FilterState {
  date: string | null;
  pickedIsoDate: string | null;
  distance: string;
  categories: string[];
}

export const DEFAULT_FILTERS: FilterState = {
  date: null,
  pickedIsoDate: null,
  distance: "25 mi",
  categories: [],
};

export function filtersFromSearchParams(params: URLSearchParams): FilterState {
  const { chip, pickedIsoDate } = dateParamToChip(params.get("date"));
  const distanceMiles = parseDistanceMiles(params.get("distance"));
  return {
    date: chip,
    pickedIsoDate,
    distance: distanceMiles ? `${distanceMiles} mi` : DEFAULT_FILTERS.distance,
    categories: parseCategoryParam(params.get("category")),
  };
}

function writeFiltersToUrl(
  pathname: string,
  searchParams: URLSearchParams,
  filters: FilterState,
  router: ReturnType<typeof useRouter>
) {
  const params = new URLSearchParams(searchParams.toString());
  const dateParam = dateChipToParam(filters.date, filters.pickedIsoDate);
  if (dateParam) params.set("date", dateParam);
  else params.delete("date");

  const miles = parseDistanceMiles(filters.distance);
  if (miles) params.set("distance", String(miles));
  else params.delete("distance");

  if (filters.categories.length) {
    params.set("category", filters.categories.join(","));
  } else {
    params.delete("category");
  }

  const qs = params.toString();
  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        selected
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
          : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--accent)]/60"
      )}
    >
      {label}
    </button>
  );
}

export function FilterSheet({
  eventCount,
  inline = false,
}: {
  eventCount: number;
  inline?: boolean;
}) {
  const experience = useExperience();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const filters = useMemo(
    () => filtersFromSearchParams(searchParams),
    [searchParams]
  );

  const update = (next: FilterState) => {
    writeFiltersToUrl(pathname, searchParams, next, router);
  };

  const body = (
    <div className="space-y-5 p-4 pt-2">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Date
        </h3>
        <div className="flex flex-wrap gap-2">
          {DATE_CHIPS.map((chip) => (
            <Chip
              key={chip}
              label={chip}
              selected={filters.date === chip}
              onClick={() =>
                update({
                  ...filters,
                  date: filters.date === chip ? null : chip,
                  pickedIsoDate:
                    chip === "Pick a Date"
                      ? filters.pickedIsoDate
                      : null,
                })
              }
            />
          ))}
        </div>
        {filters.date === "Pick a Date" && (
          <label className="block text-sm">
            <span className="sr-only">Pick a date</span>
            <input
              type="date"
              value={filters.pickedIsoDate ?? ""}
              onChange={(e) =>
                update({
                  ...filters,
                  date: "Pick a Date",
                  pickedIsoDate: e.target.value || null,
                })
              }
              className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </label>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Distance
        </h3>
        <div className="flex flex-wrap gap-2">
          {DISTANCE_CHIPS.map((chip) => (
            <Chip
              key={chip}
              label={chip}
              selected={filters.distance === chip}
              onClick={() => update({ ...filters, distance: chip })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Categories
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {experience.categories.map((cat) => {
            const selected = filters.categories.includes(cat.value);
            return (
              <button
                key={cat.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  const categories = selected
                    ? filters.categories.filter((c) => c !== cat.value)
                    : [...filters.categories, cat.value];
                  update({ ...filters, categories });
                }}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border)] bg-[var(--card)]"
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </section>

      {!inline && (
        <Button
          type="button"
          className="w-full"
          onClick={() => setOpen(false)}
          aria-label={`Show ${eventCount} events`}
        >
          Show {eventCount} Events
        </Button>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className="border-b border-[var(--border)]">
        {body}
        <div className="px-4 pb-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            Showing {eventCount} events
          </p>
        </div>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary" size="icon" aria-label="Open filters">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Narrow events by date, distance, and category.
          </SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
