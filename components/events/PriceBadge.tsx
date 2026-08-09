"use client";

import { Badge } from "@/components/ui/badge";
import { getPriceBadge, type PricedEvent } from "@/lib/events/pricing";

export function PriceBadge({
  event,
  variant = "short",
}: {
  event: PricedEvent;
  variant?: "short" | "detail";
}) {
  const badge = getPriceBadge(event, variant);
  if (!badge) return null;

  return (
    <Badge variant={badge.kind === "free" ? "free" : "paid"}>
      {badge.label}
    </Badge>
  );
}
