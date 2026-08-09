"use client";

import { cn } from "@/lib/utils";
import { useExperience } from "@/components/experience/ExperienceProvider";

const ART: Record<string, { bg: string; shape: string }> = {
  "car-meet": { bg: "#1e3a5f", shape: "M8 16h24l-3-6H11l-3 6zm4-8h16l2 4H10l2-4z" },
  "car-show": { bg: "#1a2744", shape: "M6 18h28v2H6v-2zm4-8h20l3 6H7l3-6z" },
  "drive-cruise": { bg: "#16324f", shape: "M4 20c8-8 24-8 32 0M10 14l4-4h12l4 4" },
  autocross: { bg: "#1f2a44", shape: "M8 22l8-14 8 14H8zm8-6v4" },
  "track-event": { bg: "#17233a", shape: "M6 18c6-10 22-10 28 0M10 12h20" },
  "other-auto": { bg: "#1c2438", shape: "M12 10h16v12H12zM8 14h4m16 0h4" },
  family: { bg: "#d1fae5", shape: "M12 20v-6m8 6v-6M10 10a4 4 0 108 0 4 4 0 10-8 0" },
  community: { bg: "#ccfbf1", shape: "M8 18a4 4 0 118 0M20 18a4 4 0 118 0M16 8a4 4 0 110 8" },
  arts: { bg: "#e0f2fe", shape: "M8 24l8-16 8 16H8zm8-4a2 2 0 100-4 2 2 0 000 4z" },
  outdoor: { bg: "#dcfce7", shape: "M6 24l10-16 10 16H6zm10-8l4 6H12l4-6z" },
  food: { bg: "#ecfccb", shape: "M10 8v16m4-16c0 6 0 10-2 16m10-16v16m-2-16c0 6 0 10 2 16" },
  entertainment: { bg: "#f0fdf4", shape: "M8 10l20 6-20 6V10zm22 2v12" },
  educational: { bg: "#e0f2f1", shape: "M6 14l14-6 14 6-14 6-14-6zm4 4v6c4 2 12 2 16 0v-6" },
};

export function FallbackArt({
  category,
  className,
  title,
}: {
  category: string | null | undefined;
  className?: string;
  title?: string;
}) {
  const experience = useExperience();
  const key =
    (category && experience.fallbackArt[category]) ||
    (experience.id === "overdrive" ? "other-auto" : "community");
  const art = ART[key] ?? ART["community"];

  return (
    <div
      className={cn(
        "relative overflow-hidden flex items-center justify-center",
        className
      )}
      style={{ background: art.bg }}
      role="img"
      aria-label={title ? `Illustration for ${title}` : "Event illustration"}
    >
      <svg
        viewBox="0 0 40 32"
        className="w-[70%] h-[70%] opacity-80"
        fill="none"
        stroke={experience.theme.mode === "dark" ? "#93c5fd" : "#0f766e"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={art.shape} />
      </svg>
    </div>
  );
}
