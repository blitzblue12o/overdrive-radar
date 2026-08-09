"use client";

import Link from "next/link";
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

export function ExperienceMenu() {
  const current = useExperience();
  const target = getExperienceConfig(current.switchTarget);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={current.switcherLabel}>
          {current.switcherLabel}
        </Button>
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
            href="/"
            accent="#3B82F6"
            active={current.id === "overdrive"}
          />
          <ExperienceOption
            name="EventDiscovery"
            description="Family, community, outdoor, food, and local culture nearby."
            href="/events"
            accent="#14B8A6"
            active={current.id === "event_discovery"}
          />
        </div>
        {current.id !== target.id && (
          <Button asChild className="w-full" style={{ background: target.theme.accent }}>
            <Link href={target.route}>Switch to {target.name}</Link>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
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
