-- ============================================================================
-- Overdrive Radar — Canonical Events Schema (V1, FINAL — rev2)
-- Single canonical `events` table shared by two discovery experiences
-- (Overdrive / EventDiscovery) via the `experience` discriminator.
--
-- rev2 changes vs original v1:
--   - overdrive_category expanded to match product taxonomy/Figma:
--       car_meet, car_show, drive_cruise, autocross, track_event, other
--     (previously collapsed drive_cruise/autocross/track_event into 'motorsport')
--   - event_discovery_category expanded to match product taxonomy/Figma:
--       family, community, arts_and_culture, outdoor, food_and_markets,
--       entertainment, educational
--     (previously only family/food_and_festivals/outdoor/community)
--   - added is_free / price_amount / price_currency: Figma's Event Detail
--     and card views show a Free/paid indicator ("Free", "Free entry",
--     "$10") that had no backing column in v1. is_free is a separate
--     boolean fast-path (query/filter without parsing price_amount);
--     a check constraint keeps it from disagreeing with price_amount.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists postgis;
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type experience_type as enum (
  'overdrive',
  'event_discovery'
);

-- Matches Overdrive filter taxonomy in Figma + product spec.
create type overdrive_category as enum (
  'car_meet',
  'car_show',
  'drive_cruise',
  'autocross',
  'track_event',
  'other'
);

-- Matches EventDiscovery filter taxonomy in Figma + product spec.
create type event_discovery_category as enum (
  'family',
  'community',
  'arts_and_culture',
  'outdoor',
  'food_and_markets',
  'entertainment',
  'educational'
);

create type source_type as enum (
  'manual',
  'organizer_submission',
  'ticketmaster'
  -- add future external-provider adapters here, e.g. 'predicthq'
);

create type moderation_status as enum (
  'pending',
  'approved',
  'rejected'
);

create type publication_status as enum (
  'draft',
  'published',
  'unpublished'
);

create type event_status as enum (
  'scheduled',
  'cancelled',
  'postponed'
);

create type recurrence_type as enum (
  'none',
  'weekly',
  'monthly',
  'custom'
);

-- ----------------------------------------------------------------------------
-- Table: events
-- ----------------------------------------------------------------------------

create table events (
  id uuid primary key default gen_random_uuid(),

  -- ── Experience isolation ────────────────────────────────────────────────
  -- Content discriminator, NOT multi-tenancy. Every application query must
  -- filter on this; there is no infrastructure-level isolation between the
  -- two experiences (by design — they share everything except content).
  experience experience_type not null,

  overdrive_category overdrive_category,
  event_discovery_category event_discovery_category,

  -- ── Core content ─────────────────────────────────────────────────────────
  title text not null,
  description text,

  starts_at timestamptz not null,
  ends_at timestamptz,  -- nullable: legitimate for start-only events

  -- IANA timezone of the event's local time (e.g. 'America/Los_Angeles').
  -- Nullable in V1 — not required for manual curation/ingestion, but should
  -- be enforced at the application layer before an event is published,
  -- since calendar export (Add to Calendar / ICS) depends on it.
  timezone text,

  venue_name text,
  address text,

  -- ── Pricing ──────────────────────────────────────────────────────────────
  -- is_free: null = unknown/not applicable (no badge shown), true = "Free"/
  -- "Free entry" badge, false = paid (show formatted price_amount).
  -- price_amount: only meaningful when is_free = false; null otherwise.
  -- Kept as two fields (rather than inferring free-ness from price_amount
  -- alone) for a cheap boolean filter/index path; the check constraint
  -- below prevents them from disagreeing.
  is_free boolean,
  price_amount numeric(8, 2),
  price_currency text default 'USD',

  -- ── Geo ──────────────────────────────────────────────────────────────────
  -- Write interface: application/import/admin code writes latitude+longitude
  -- ONLY. `location` is derived by trigger and never written directly.
  -- `location` remains authoritative for all spatial querying — the
  -- distinction is about which column the write path uses, not which
  -- column wins a conflict (there is no longer a conflict possible).
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  location geography(Point, 4326),

  image_url text,

  recurrence_type recurrence_type not null default 'none',
  recurrence_note text,

  moderation_status moderation_status not null default 'pending',
  publication_status publication_status not null default 'draft',
  event_status event_status not null default 'scheduled',

  source_type source_type not null,
  source_id text,               -- external provider's native event ID.
                                 -- Required for true external-provider
                                 -- adapters (e.g. ticketmaster); null for
                                 -- manual and organizer_submission, which
                                 -- have no external provider identity.
  source_url text,
  last_source_sync_at timestamptz,
  source_metadata jsonb,

  organizer_name text,
  organizer_email text,

  last_verified_at timestamptz,

  possible_duplicate_of uuid references events(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Exactly one category column must be set, matching the experience.
  constraint category_matches_experience check (
    (experience = 'overdrive'
      and overdrive_category is not null
      and event_discovery_category is null)
    or
    (experience = 'event_discovery'
      and event_discovery_category is not null
      and overdrive_category is null)
  ),

  constraint ends_after_starts check (ends_at is null or ends_at >= starts_at),

  -- Only true external-provider adapters require a source_id. Manual
  -- curation and organizer submissions have no external identity — the
  -- canonical event UUID is sufficient. Add new provider types to this
  -- list as adapters are built; do not require organizer_submission to
  -- fabricate a fake external id to satisfy this constraint.
  constraint source_id_required_for_external_providers check (
    source_type not in ('ticketmaster') or source_id is not null
  ),

  -- Coordinates: both present or both absent, never one alone.
  constraint lat_lng_both_or_neither check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  ),
  constraint latitude_in_range check (latitude is null or latitude between -90 and 90),
  constraint longitude_in_range check (longitude is null or longitude between -180 and 180),

  constraint price_amount_non_negative check (price_amount is null or price_amount >= 0),

  -- Keeps is_free and price_amount from disagreeing. Free events must not
  -- carry a price; paid events (is_free = false) may have a null
  -- price_amount if the amount just isn't known yet (still "paid", no
  -- figure to show). is_free = null (unknown) permits either.
  constraint is_free_matches_price check (
    is_free is null
    or (is_free = true and price_amount is null)
    or (is_free = false)
  )
);

comment on column events.experience is
  'Discriminator isolating Overdrive vs EventDiscovery content. Every application query against this table must filter on it — there is no infrastructure-level isolation.';
comment on column events.is_free is
  'null = unknown/not applicable (no badge shown), true = "Free"/"Free entry" badge, false = paid. See is_free_matches_price constraint.';
comment on column events.price_amount is
  'Only meaningful when is_free = false. Null = paid but amount unknown. Must be null when is_free = true.';
comment on column events.latitude is
  'Write interface for coordinates. Application/import/admin code sets latitude+longitude only; location is derived by trigger.';
comment on column events.location is
  'Derived, authoritative for all spatial queries (bounding box, radius, nearest). Never written directly by application code — see sync_event_location trigger.';
comment on column events.source_id is
  'External provider''s native event ID. Required only for true external-provider adapters (see source_id_required_for_external_providers). Null for manual and organizer_submission.';
comment on column events.source_metadata is
  'Raw/provider-specific fields (e.g. Ticketmaster classification IDs) that should never leak into canonical columns.';
comment on column events.timezone is
  'IANA timezone of the event''s local time. Nullable in V1; should be required by application validation before publication_status = published, since calendar export depends on it.';

-- ----------------------------------------------------------------------------
-- Trigger: derive location from latitude/longitude (one-directional)
-- ----------------------------------------------------------------------------
-- Application code is the single write interface for coordinates via
-- latitude/longitude. This trigger derives `location` from them and clears
-- `location` when coordinates are cleared. It does NOT read from `location`
-- at all, eliminating the prior bug where an update to lat/lng alone could
-- be silently discarded by location regenerating stale lat/lng.

create or replace function sync_event_location()
returns trigger as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  else
    new.location := null;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_sync_event_location
  before insert or update of latitude, longitude
  on events
  for each row
  execute function sync_event_location();

-- ----------------------------------------------------------------------------
-- Trigger: generic updated_at maintenance (separated from geo concerns)
-- ----------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_events_updated_at
  before update on events
  for each row
  execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Indexes (justified against V1 access patterns only)
-- ----------------------------------------------------------------------------

-- Spatial: bounding-box / radius / nearest-neighbor queries
create index idx_events_location on events using gist (location);

-- Primary hot path: isolated, filtered, sorted discovery feed per experience
create index idx_events_experience_status on events (
  experience, publication_status, moderation_status, starts_at
);

-- Source ingestion lookups (dedup-by-identity, incremental sync)
create index idx_events_source on events (source_type, source_id);

-- Enforce provider-event uniqueness where a source_id exists. Separate from
-- fuzzy pg_trgm dedup below — exact provider identity is a hard guarantee,
-- fuzzy matching is only for cross-source/manual ambiguity.
create unique index idx_events_source_identity
  on events (source_type, source_id)
  where source_id is not null;

-- Trigram indexes for pg_trgm fuzzy duplicate detection
create index idx_events_title_trgm on events using gin (title gin_trgm_ops);
create index idx_events_venue_trgm on events using gin (venue_name gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- Duplicate detection (V1): flag only, never auto-merge
-- ----------------------------------------------------------------------------
-- Exact-identity duplicates (same provider + same source_id) are prevented
-- at the database level by idx_events_source_identity above and never reach
-- this function. This handles the remaining case: different sources (or
-- manual entries) describing what's likely the same real-world event.

create or replace function find_possible_duplicates(
  p_event_id uuid,
  p_similarity_threshold real default 0.4
)
returns table (
  candidate_id uuid,
  candidate_title text,
  title_similarity real,
  same_day boolean,
  venue_similarity real
) as $$
  select
    e.id as candidate_id,
    e.title as candidate_title,
    similarity(e.title, ev.title) as title_similarity,
    (date_trunc('day', e.starts_at) = date_trunc('day', ev.starts_at)) as same_day,
    coalesce(similarity(e.venue_name, ev.venue_name), 0) as venue_similarity
  from events e
  cross join (select * from events where id = p_event_id) ev
  where e.id != ev.id
    and e.experience = ev.experience
    and similarity(e.title, ev.title) > p_similarity_threshold
    and date_trunc('day', e.starts_at) = date_trunc('day', ev.starts_at)
  order by title_similarity desc
  limit 5;
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- V1 model: public (anon) can read only approved+published events. All
-- writes — including organizer submissions — go through server-side code
-- using the service_role key, which bypasses RLS entirely. This keeps V1
-- simple: no public write policies, no per-action role matrix, no organizer
-- auth system. `experience` is NOT used as an RLS boundary — it's a content
-- filter the application applies in its own queries, not a security
-- boundary, since both experiences are equally public.

alter table events enable row level security;

create policy "public can read approved and published events"
  on events
  for select
  to anon, authenticated
  using (
    moderation_status = 'approved'
    and publication_status = 'published'
  );

-- No insert/update/delete policies are defined for anon/authenticated —
-- absence of a policy means the action is denied by default under RLS.
-- All writes (organizer submission intake, moderation, ingestion adapters)
-- happen server-side via the service_role key, which is exempt from RLS.
-- If a future need arises for authenticated users to write directly
-- (e.g. an organizer editing their own pending submission), add a narrowly
-- scoped policy then — do not pre-build it now.

-- ----------------------------------------------------------------------------
-- Example queries (corrected)
-- ----------------------------------------------------------------------------

-- Events visible on the map for a given experience within the current
-- Mapbox viewport bounding box: published + approved + not cancelled +
-- upcoming (using coalesce so start-only events aren't excluded), with an
-- explicit location-not-null guard so ungeocoded rows don't error out of
-- the spatial predicate.
--
-- select id, title, latitude, longitude, starts_at, is_free, price_amount, price_currency
-- from events
-- where experience = 'overdrive'
--   and publication_status = 'published'
--   and moderation_status = 'approved'
--   and event_status != 'cancelled'
--   and location is not null
--   and coalesce(ends_at, starts_at) >= now()
--   and location && st_setsrid(
--         st_makebox2d(st_point(:min_lng, :min_lat), st_point(:max_lng, :max_lat)),
--         4326
--       )::geography;

-- Nearest N events to a point, same filters, for a "near me" list view.
-- Note: <-> against a geography point uses the GiST index for indexed
-- nearest-neighbor ordering, same as the original — corrected here only to
-- add the location-not-null guard and coalesce(ends_at, starts_at).
--
-- select id, title,
--        location <-> st_setsrid(st_makepoint(:lng, :lat), 4326)::geography as dist_meters
-- from events
-- where experience = 'event_discovery'
--   and publication_status = 'published'
--   and moderation_status = 'approved'
--   and location is not null
--   and coalesce(ends_at, starts_at) >= now()
-- order by location <-> st_setsrid(st_makepoint(:lng, :lat), 4326)::geography
-- limit 20;
