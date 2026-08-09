"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { getExperienceConfig } from "@/lib/config/experiences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GEO_CONTEXT_PARAMS } from "@/lib/events/filters";

export function ExperienceMenu({
  compact = false,
}: {
  /** Icon-only trigger for tight mobile headers. */
  compact?: boolean;
}) {
  const current = useExperience();
  const target = getExperienceConfig(current.switchTarget);
  const searchParams = useSearchParams();
  const geoQuery = preserveGeoContext(searchParams);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {compact ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label={current.switcherLabel}
            title={current.switcherLabel}
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            aria-label={current.switcherLabel}
          >
            {current.switcherLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch experience</DialogTitle>
          <DialogDescription>
            Overdrive and EventDiscovery share one app with separate content and themes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <ExperienceOption
            name="Overdrive"
            description="Automotive meets, shows, drives, and track days across SoCal."
            href={withGeo("/", geoQuery)}
            accent="#3B82F6"
            active={current.id === "overdrive"}
          />
          <ExperienceOption
            name="EventDiscovery"
            description="Family, community, outdoor, food, and local culture nearby."
            href={withGeo("/events", geoQuery)}
            accent="#14B8A6"
            active={current.id === "event_discovery"}
          />
        </div>
        {current.id !== target.id && (
          <Button asChild className="w-full" style={{ background: target.theme.accent }}>
            <Link href={withGeo(target.route, geoQuery)}>
              Switch to {target.name}
            </Link>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function preserveGeoContext(searchParams: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const key of GEO_CONTEXT_PARAMS) {
    const value = searchParams.get(key);
    if (value != null && value !== "") next.set(key, value);
  }
  return next.toString();
}

function withGeo(path: string, geoQuery: string): string {
  return geoQuery ? `${path}?${geoQuery}` : path;
}

function ExperienceOption({
  name,
  description,
  href,
  accent,
  active,
}: {
  name: string;
  description: string;
  href: string;
  accent: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[var(--border)] p-4 transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={active ? { borderColor: accent } : undefined}
      aria-current={active ? "page" : undefined}
    >
      <p className="font-semibold" style={{ color: accent }}>
        {name}
      </p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
      {active && (
        <p className="mt-2 text-xs font-medium" style={{ color: accent }}>
          Currently viewing
        </p>
      )}
    </Link>
  );
}
