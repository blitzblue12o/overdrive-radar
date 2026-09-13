-- ============================================================================
-- Public grants hardening + one-time display data cleanup for ingested text/URLs
-- ============================================================================

-- Narrow public DML: RLS already blocks writes, but revoke unused table grants.
revoke insert, update, delete on table public.events from anon, authenticated;
revoke insert, update, delete on table public.sources from anon, authenticated;

-- Keep intentional public reads.
grant select on table public.events to anon, authenticated;
grant select on table public.sources to anon, authenticated;

-- Pipeline ledger remains service-role only (no grants to anon/authenticated).
revoke all on table public.pipeline_runs from anon, authenticated;
revoke all on table public.source_sync_runs from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Backfill: strip HTML from venue/address; absolutize relative source_url when
-- the source feed_url base makes resolution deterministic.
-- ----------------------------------------------------------------------------

update events e
set
  venue_name = nullif(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(e.venue_name, ''), '<[^>]+>', ' ', 'g'),
          '\s+',
          ' ',
          'g'
        ),
        '^[-–—•*]+\s*',
        ''
      )
    ),
    ''
  ),
  address = nullif(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(e.address, ''), '<[^>]+>', ' ', 'g'),
          '\s+',
          ' ',
          'g'
        ),
        '^[-–—•*]+\s*',
        ''
      )
    ),
    ''
  ),
  updated_at = now()
where e.venue_name ~* '<[^>]+>'
   or e.address ~* '<[^>]+>'
   or e.venue_name ~ '^[-–—•*]+\s'
   or e.address ~ '^[-–—•*]+\s';

-- Resolve relative source_url values against the owning source feed origin.
update events e
set
  source_url = case
    when s.feed_url is null then null
    when e.source_url ~ '^/' then
      regexp_replace(s.feed_url, '(https?://[^/]+).*', '\1') || e.source_url
    else e.source_url
  end,
  updated_at = now()
from sources s
where e.source_id like s.id::text || ':%'
  and e.source_url is not null
  and e.source_url ~ '^/'
  and s.feed_url ~* '^https?://';

-- Drop remaining non-http(s) source URLs (should be rare after resolution).
update events
set source_url = null, updated_at = now()
where source_url is not null
  and source_url !~* '^https?://';
