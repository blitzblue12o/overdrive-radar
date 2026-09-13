"use client";

import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CarFront,
  Flag,
  GraduationCap,
  Music,
  Palette,
  Route,
  Sparkles,
  TrafficCone,
  TreePine,
  Users,
  UsersRound,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // Overdrive
  car_meet: CarFront,
  car_show: Sparkles,
  drive_cruise: Route,
  autocross: TrafficCone,
  track_event: Flag,
  other: Calendar,
  // EventDiscovery
  family: Users,
  community: UsersRound,
  arts_and_culture: Palette,
  outdoor: TreePine,
  food_and_markets: UtensilsCrossed,
  entertainment: Music,
  educational: GraduationCap,
};

export function categoryIconFor(
  category: string | null | undefined
): LucideIcon {
  if (!category) return Calendar;
  return CATEGORY_ICONS[category] ?? Calendar;
}

export function CategoryIcon({
  category,
  className,
  strokeWidth = 1.75,
}: {
  category: string | null | undefined;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = categoryIconFor(category);
  return (
    <Icon
      className={cn("shrink-0", className)}
      strokeWidth={strokeWidth}
      aria-hidden
    />
  );
}
