# Overdrive Radar

Map-first event discovery with two content experiences in one Next.js codebase:

- **Overdrive** (`/`) — automotive events, dark UI, blue accent
- **EventDiscovery** (`/events`) — general local events, light UI, mint/teal accent

Wave 1 delivers the shared Mapbox + Supabase foundation, experience isolation, mobile bottom sheet, desktop split layout, pricing badges, and client-side calendar export.

## Architecture overview

| Layer | Role |
| --- | --- |
| Next.js App Router | Routes `/` and `/events`; API `GET /api/events` |
| Experience config + provider | Theme, categories, placeholders; shared components via `useExperience()` |
| Supabase (`events` table) | Canonical schema with PostGIS; anon read of approved+published rows |
| Mapbox GL | GeoJSON source + native clustering; React `selectedEventId` is selection source of truth |
| Shared UI | One component tree for both experiences (cards, list, detail, filters, sheet) |

Every events query requires an `experience` argument. Overdrive must never receive EventDiscovery rows and vice versa.

## Setup

### Prerequisites

- Node.js 20+
- Docker Desktop (for local Supabase)
- Supabase CLI (`supabase`)
- Mapbox public access token

### Install

```bash
npm install
cp .env.example .env.local
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL (this project defaults to `http://127.0.0.1:54331` to avoid colliding with other local Supabase stacks) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key only — never commit `service_role` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox public token |

### Supabase (local)

```bash
supabase start
supabase db reset   # applies migrations + seed/seed.sql
```

Copy the local `API URL` and `anon key` from `supabase status` into `.env.local`.

Schema source of truth: `supabase/migrations/0001_events_schema.sql` (verbatim from the finalized V1 SQL). Viewport RPC + grants: `0002_viewport_rpc.sql`.

### Mapbox

1. Create a token at [mapbox.com](https://account.mapbox.com/access-tokens/)
2. Set `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.local`
3. Styles used: `mapbox/dark-v11` (Overdrive), `mapbox/light-v11` (EventDiscovery)

### Local development

```bash
npm run dev
```

- Overdrive: [http://localhost:3000](http://localhost:3000)
- EventDiscovery: [http://localhost:3000/events](http://localhost:3000/events)

### Build / test / lint

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Deployment

This is a Next.js App Router app at the **repository root** (`package.json`, `next.config.mjs`, `app/`). Vercel should auto-detect Next.js; Root Directory must stay empty / `.`.

### Environment variables (Vercel project dashboard)

Set these for **Production** (and Preview if you want previews to hit live data). Use the **live** Supabase project — not local Docker ports.

| Vercel env var | Source of value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL (`https://fhnfjzdrhzwypuqxakrn.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → `anon` `public` key (never `service_role`) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox account → public access token (`pk.…`) |

Local mapping: the same three names as in `.env.example` / `.env.local`, but with live values instead of `http://127.0.0.1:54331` and the local demo anon key.

### Manual deploy steps (human)

1. Import or open the GitHub repo in Vercel (or `vercel link` / `vercel --prod` if you use the CLI locally).
2. Confirm Framework = Next.js, Root Directory = `.`, Node = `20.x`.
3. Paste the three env vars above into Project Settings → Environment Variables.
4. Deploy Production from `main` (or promote a Preview).
5. Run the post-deploy checklist on the live URL.

This repo does not automate Vercel linking or production deploys from CI in Wave 1/2.

## Project layout (Wave 1–2)

```
app/                    # routes + API
components/             # shared experience UI + map
lib/config/             # experience configs
lib/events/             # queries, pricing, ICS, types
lib/supabase/           # anon browser + server clients
supabase/migrations/    # schema + viewport RPC
supabase/seed/          # fictional SoCal seed events
tests/                  # isolation, query, smoke tests
docs/IMPLEMENTATION_PLAN.md
```

## License

Private — all rights reserved.
