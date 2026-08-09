# Implementation Plan — Overdrive Radar

## Wave 1 scope delivered

- Next.js 14 App Router, TypeScript strict, Tailwind, shadcn-style primitives (`button`, `sheet`, `dialog`, `input`, `badge`)
- Canonical schema applied as `supabase/migrations/0001_events_schema.sql` (verbatim)
- Viewport RPC + table grants in `0002_viewport_rpc.sql`
- Seed: 10 Overdrive + 15 EventDiscovery fictional SoCal events with free / priced / paid-unknown mixes
- Routes: `/` (Overdrive), `/events` (EventDiscovery) — no `/overdrive`
- Shared experience config + `ExperienceProvider` / `useExperience()`
- Shared components: map (GeoJSON clusters), cards, preview, detail, list, search shell, filter shell, mobile bottom sheet (4 states), experience menu, calendar ICS export
- `GET /api/events` → GeoJSON FeatureCollection; one fetch feeds map + list
- Bidirectional selection sync with flyTo refetch guard
- Pricing badge rules aligned to `is_free` / `price_amount` / `price_currency`
- Category fallback art (CSS/SVG) for both taxonomies
- High-value tests: experience isolation, query filters/pricing, route smoke
- README + this plan

## Architectural decisions

1. **Content discriminator, not tenancy** — `experience` is required on every events query; RLS stays public-read for approved+published for both experiences.
2. **Anon-only Wave 1** — no service-role key in the app; no writes.
3. **Viewport RPC** — PostGIS `&&` bbox filtering runs in `get_events_in_viewport` for a stable PostgREST surface; JS bbox fallback exists for tests/mocks.
4. **Single selection state** — `selectedEventId` in React drives list highlight and Mapbox layer filters; Mapbox feature-state is not a second source of truth.
5. **Programmatic flyTo guard** — `suppressViewportFetchRef` prevents selection-driven camera moves from refetching and clearing selection.
6. **Filter/search UI is a shell** — chips and search overlay are present; query wiring is Wave 2.
7. **Instant theme swap on navigation** — experience switch uses route navigation + config theme tokens; full 350–450ms cross-fade deferred if not already cheap (see Deferred).

## Wave 2 delivered

- Live seed: 10 Overdrive + 15 EventDiscovery on `fhnfjzdrhzwypuqxakrn`
- `0003_search_events.sql` — trigram `search_events` RPC (local + live)
- Unified `getEvents()` query layer; API accepts `q`, `date`, `distance`, `category`
- SearchBar / FilterSheet wired to URL params (source of truth)
- Combined debounced fetch for viewport + filters; `consumeViewportSuppress` for flyTo
- Functional empty states (clear filters / expand distance vs bare area)
- ~400ms experience-switch theme + map opacity cross-fade (`prefers-reduced-motion` safe)

## Deferred work

### Wave 3
- Ingestion adapters, source registry, dedup automation beyond V1 SQL helpers

### Wave 4
- Organizer submission form, moderation/admin UI
- Sentry, PostHog, PWA
- Anything requiring `service_role`

## Known limitations

- Without `NEXT_PUBLIC_MAPBOX_TOKEN`, the map area shows a configuration placeholder
- Place/address autocomplete and geocoding-backed location search are deferred
- Date boundaries hardcoded to `America/Los_Angeles` (SoCal V1)
- ICS uses UTC `DTSTART`/`DTEND`; event `timezone` is attached as `X-WR-TIMEZONE` when present
- Geolocate control is present; accuracy depends on browser permission
- Trigram similarity (not full-text / external search)

## Deviations from the Wave 1 prompt

| Item | Notes |
| --- | --- |
| `0002_viewport_rpc.sql` | Added (not in the pasted schema file) so bbox queries use PostGIS via RPC + explicit `GRANT SELECT` for anon |
| Nested git directory | App lives in `overdrive-radar/` after `gh repo clone` into an already-named parent folder |
| Local Supabase ports | Offset to API `54331` / DB `54332` / Studio `54333` because default `54322` was already bound by another local project (`family-os`) |

## Human configuration required

1. Start Docker + `supabase start` / `supabase db reset`
2. Fill `.env.local` from `.env.example` using local anon credentials + Mapbox token
3. `npm run dev` and verify both routes
