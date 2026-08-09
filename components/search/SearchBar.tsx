"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useExperience } from "@/components/experience/ExperienceProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { debounce } from "@/lib/utils";

export function SearchBar() {
  const experience = useExperience();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(urlQuery);
  const searchParamsRef = useRef(searchParams);
  const pathnameRef = useRef(pathname);
  searchParamsRef.current = searchParams;
  pathnameRef.current = pathname;

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const sync = debounce((value: string) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      const trimmed = value.trim();
      const current = params.get("q") ?? "";
      if (trimmed === current) return;
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const qs = params.toString();
      const path = pathnameRef.current;
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    }, 300);

    sync(query);
    return () => sync.cancel();
  }, [query, router]);

  const displayLabel = urlQuery || experience.searchPlaceholder;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        aria-label="Open search"
      >
        <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
        <span
          className={
            urlQuery
              ? "truncate text-[var(--foreground)]"
              : "truncate text-[var(--muted-foreground)]"
          }
        >
          {displayLabel}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] translate-y-0 sm:top-[15%]">
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>
              Search event titles and venues in the current map area.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={experience.searchPlaceholder}
              className="pl-9"
              autoFocus
              aria-label="Search query"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
