"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { debounce } from "@/lib/utils";

export function SearchBar() {
  const experience = useExperience();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const hintId = useId();

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

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
        aria-hidden
      />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={experience.searchPlaceholder}
        className="h-11 pl-9"
        aria-label="Search query"
        aria-describedby={hintId}
        title="Search event titles and venues in the current map area"
        enterKeyHint="search"
        autoComplete="off"
      />
      <p id={hintId} className="sr-only">
        Search event titles and venues in the current map area.
      </p>
    </div>
  );
}
