-- ============================================================================
-- Sync orchestration: batched cron, source locks, run ledger, conditional HTTP
-- ============================================================================

-- ----------------------------------------------------------------------------
-- sources: batch assignment + conditional fetch cache + expanded sync status
-- ----------------------------------------------------------------------------

alter table sources
  add column if not exists sync_batch smallint not null default 0
    check (sync_batch between 0 and 3);

alter table sources
  add column if not exists http_etag text;

alter table sources
  add column if not exists http_last_modified text;

-- Expand last_sync_status to distinguish empty-success and lock skips.
alter table sources drop constraint if exists sources_last_sync_status_check;
alter table sources
  add constraint sources_last_sync_status_check
  check (
    last_sync_status is null
    or last_sync_status in (
      'success',
      'success_empty',
      'partial_failure',
      'failure',
      'skipped_locked'
    )
  );

create index if not exists idx_sources_sync_batch_active
  on sources (sync_batch)
  where active = true;

-- Initial workload-balanced batch assignment (upcoming event volume proxy).
-- Heavy sources spread across batches; PCA-LA paired with Thousand Oaks.
update sources set sync_batch = 0 where name in (
  'City of Yorba Linda — Parks & Recreation Events',
  'City of Anaheim — Calendar',
  'City of Ventura — Parks & Recreation Events',
  'City of Moorpark — Community Events',
  'City of Fillmore — Community Events',
  'City of Ojai — Events'
);

update sources set sync_batch = 1 where name in (
  'Thousand Oaks Library — Events Calendar',
  'PCA-LA (Porsche Club of America — Los Angeles)',
  'City of Beverly Hills — City Events and Activities',
  'Beverly Hills Public Library — Events and Activities',
  'City of Port Hueneme — Recreation & Community Services',
  'City of Escondido — City Events'
);

update sources set sync_batch = 2 where name in (
  'Camarillo Public Library — Events Calendar',
  'City of Poway — Community Events',
  'City of Imperial Beach — Events Calendar',
  'City of Westlake Village — Special Events',
  'City of La Mesa — Community Events',
  'City of Del Mar — Community Calendar'
);

update sources set sync_batch = 3 where name in (
  'City of Coronado — Main Calendar',
  'Simi Valley Public Library — Events',
  'City of Santa Paula — Calendar',
  'City of Malibu — Special Events'
);

-- Inactive / unassigned sources stay on default batch 0 (not synced while inactive).

-- ----------------------------------------------------------------------------
-- Atomic event upsert (avoids select-then-insert races)
-- ----------------------------------------------------------------------------

create or replace function upsert_ingested_event(p_event jsonb)
returns table (event_id uuid, was_inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_inserted boolean := false;
begin
  insert into events (
    experience,
    overdrive_category,
    event_discovery_category,
    title,
    description,
    starts_at,
    ends_at,
    timezone,
    venue_name,
    address,
    latitude,
    longitude,
    source_type,
    source_id,
    source_url,
    source_metadata,
    organizer_name,
    moderation_status,
    publication_status,
    event_status,
    last_source_sync_at
  )
  values (
    (p_event->>'experience')::experience_type,
    nullif(p_event->>'overdrive_category', '')::overdrive_category,
    nullif(p_event->>'event_discovery_category', '')::event_discovery_category,
    p_event->>'title',
    p_event->>'description',
    (p_event->>'starts_at')::timestamptz,
    nullif(p_event->>'ends_at', '')::timestamptz,
    p_event->>'timezone',
    p_event->>'venue_name',
    p_event->>'address',
    nullif(p_event->>'latitude', '')::double precision,
    nullif(p_event->>'longitude', '')::double precision,
    (p_event->>'source_type')::source_type,
    p_event->>'source_id',
    p_event->>'source_url',
    coalesce(p_event->'source_metadata', '{}'::jsonb),
    p_event->>'organizer_name',
    coalesce(nullif(p_event->>'moderation_status', '')::moderation_status, 'pending'),
    coalesce(nullif(p_event->>'publication_status', '')::publication_status, 'draft'),
    coalesce(nullif(p_event->>'event_status', '')::event_status, 'scheduled'),
    coalesce((p_event->>'last_source_sync_at')::timestamptz, now())
  )
  on conflict (source_type, source_id) where source_id is not null
  do update set
    title = excluded.title,
    description = excluded.description,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    timezone = excluded.timezone,
    venue_name = excluded.venue_name,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    source_url = excluded.source_url,
    source_metadata = excluded.source_metadata,
    organizer_name = excluded.organizer_name,
    last_source_sync_at = excluded.last_source_sync_at,
    overdrive_category = excluded.overdrive_category,
    event_discovery_category = excluded.event_discovery_category,
    updated_at = now()
  returning events.id, (xmax = 0) into v_id, v_inserted;

  event_id := v_id;
  was_inserted := v_inserted;
  return next;
end;
$$;

revoke all on function upsert_ingested_event(jsonb) from public;
grant execute on function upsert_ingested_event(jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- Source-level advisory locks (keyed by source UUID)
-- ----------------------------------------------------------------------------

create or replace function try_acquire_source_sync_lock(p_source_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Namespace 87201453 keeps source locks distinct from other advisory locks.
  return pg_try_advisory_lock(87201453, hashtext(p_source_id::text));
end;
$$;

create or replace function release_source_sync_lock(p_source_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return pg_advisory_unlock(87201453, hashtext(p_source_id::text));
end;
$$;

revoke all on function try_acquire_source_sync_lock(uuid) from public;
revoke all on function release_source_sync_lock(uuid) from public;
grant execute on function try_acquire_source_sync_lock(uuid) to service_role;
grant execute on function release_source_sync_lock(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Pipeline run ledger
-- ----------------------------------------------------------------------------

create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  batch_id smallint,
  invocation text not null default 'unknown'
    check (invocation in ('scheduled', 'manual', 'unknown')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in (
      'running',
      'success',
      'partial_failure',
      'failure',
      'abandoned',
      'timed_out'
    )),
  sources_attempted integer not null default 0,
  sources_succeeded integer not null default 0,
  sources_failed integer not null default 0,
  sources_skipped_locked integer not null default 0,
  events_fetched integer not null default 0,
  events_inserted integer not null default 0,
  events_updated integer not null default 0,
  events_skipped integer not null default 0,
  duration_ms integer,
  error_summary text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pipeline_runs_job_started
  on pipeline_runs (job_type, started_at desc);

create index if not exists idx_pipeline_runs_batch_started
  on pipeline_runs (batch_id, started_at desc)
  where batch_id is not null;

create table if not exists source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pipeline_runs (id) on delete cascade,
  source_id uuid not null references sources (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null
    check (status in (
      'success',
      'success_empty',
      'partial_failure',
      'failure',
      'skipped_locked'
    )),
  fetched integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  duration_ms integer,
  error text,
  anomaly_warning text,
  created_at timestamptz not null default now()
);

create index if not exists idx_source_sync_runs_run
  on source_sync_runs (run_id);

create index if not exists idx_source_sync_runs_source_started
  on source_sync_runs (source_id, started_at desc);

alter table pipeline_runs enable row level security;
alter table source_sync_runs enable row level security;

-- Service role bypasses RLS; no anon/authenticated policies (internal ops only).
