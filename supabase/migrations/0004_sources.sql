-- Wave 3: source registry + source_type values for ICS/RSS ingestion.
-- Additive only — does not alter events columns beyond enum extension.

alter type source_type add value if not exists 'ics';
alter type source_type add value if not exists 'rss';
alter type source_type add value if not exists 'motorsportreg';

create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  experience experience_type not null,
  adapter_type text not null
    check (adapter_type in ('ics', 'rss', 'motorsportreg')),
  feed_url text,
  active boolean not null default true,
  default_category_overdrive overdrive_category,
  default_category_event_discovery event_discovery_category,
  last_synced_at timestamptz,
  last_sync_status text
    check (
      last_sync_status is null
      or last_sync_status in ('success', 'partial_failure', 'failure')
    ),
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_default_category_matches_experience check (
    (
      experience = 'overdrive'
      and default_category_overdrive is not null
      and default_category_event_discovery is null
    )
    or (
      experience = 'event_discovery'
      and default_category_event_discovery is not null
      and default_category_overdrive is null
    )
  )
);

create unique index idx_sources_name_experience on sources (name, experience);
create index idx_sources_active_experience on sources (experience, active);

create trigger sources_set_updated_at
  before update on sources
  for each row
  execute function set_updated_at();

-- Public can read active sources (optional transparency); writes are service_role only.
alter table sources enable row level security;

create policy "public can read active sources"
  on sources
  for select
  to anon, authenticated
  using (active = true);

-- No insert/update/delete policies for anon/authenticated — service_role bypasses RLS.
