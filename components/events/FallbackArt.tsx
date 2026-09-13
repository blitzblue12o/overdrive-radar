"use client";

import { cn } from "@/lib/utils";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { CategoryIcon } from "@/components/events/CategoryIcon";
import { formatCategoryLabel } from "@/lib/events/format";

const TONE: Record<string, string> = {
  car_meet: "#152238",
  car_show: "#141f33",
  drive_cruise: "#122033",
  autocross: "#161f30",
  track_event: "#131c2c",
  other: "#151b28",
  family: "#e8f5f0",
  community: "#e6f4f2",
  arts_and_culture: "#e8f1f8",
  outdoor: "#e8f5ec",
  food_and_markets: "#f0f5e6",
  entertainment: "#eef6f0",
  educational: "#e8f2f1",
};

export function FallbackArt({
  category,
  className,
  title,
  sourceLabel,
  variant = "card",
}: {
  category: string | null | undefined;
  className?: string;
  title?: string;
  sourceLabel?: string | null;
  /** Compact square for cards vs designed detail hero. */
  variant?: "card" | "hero";
}) {
  const experience = useExperience();
  const categoryLabel = formatCategoryLabel(category, experience.categories);
  const bg =
    (category && TONE[category]) ||
    (experience.id === "overdrive" ? TONE.other : TONE.community);
  const stroke =
    experience.theme.mode === "dark" ? "rgba(147,197,253,0.55)" : "rgba(15,118,110,0.45)";
  const ink =
    experience.theme.mode === "dark" ? "rgba(226,232,240,0.92)" : "rgba(15,23,42,0.88)";
  const muted =
    experience.theme.mode === "dark" ? "rgba(148,163,184,0.9)" : "rgba(100,116,139,0.95)";

  if (variant === "hero") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-[var(--border)]/60",
          className
        )}
        style={{ background: bg }}
        role="img"
        aria-label={title ? `Illustration for ${title}` : "Event illustration"}
      >
        {/* Subtle route / grid motif */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]"
          aria-hidden
        >
          <defs>
            <pattern
              id="od-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M24 0H0V24"
                fill="none"
                stroke={stroke}
                strokeWidth="0.6"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#od-grid)" />
          <path
            d="M-10 70 C 80 20, 160 110, 280 40"
            fill="none"
            stroke={stroke}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>

        <CategoryIcon
          category={category}
          className="pointer-events-none absolute -right-2 -bottom-3 h-[7.5rem] w-[7.5rem] opacity-[0.14]"
          strokeWidth={1.25}
        />

        <div className="relative flex h-full min-h-[7.5rem] flex-col justify-end gap-1 px-4 py-3 sm:min-h-[8.25rem]">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: muted }}
          >
            {categoryLabel}
          </p>
          {sourceLabel ? (
            <p className="text-xs font-medium" style={{ color: ink }}>
              {sourceLabel}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden flex items-center justify-center rounded-md",
        className
      )}
      style={{ background: bg }}
      role="img"
      aria-label={title ? `Illustration for ${title}` : "Event illustration"}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
        aria-hidden
      >
        <path
          d="M0 28 C 18 10, 36 42, 56 22"
          fill="none"
          stroke={stroke}
          strokeWidth="1.2"
        />
      </svg>
      <CategoryIcon
        category={category}
        className="relative h-[55%] w-[55%] opacity-80"
        strokeWidth={1.6}
      />
    </div>
  );
}
