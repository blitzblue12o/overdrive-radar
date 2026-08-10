-- M2: source trust policy + minimal automated decision provenance.
-- Fail closed: sources default to probation; only explicitly trusted sources
-- may be auto-published by the manual M2 executor.

alter table sources
  add column if not exists publication_policy text not null default 'probation'
    check (publication_policy in ('probation', 'trusted'));

comment on column sources.publication_policy is
  'EventDiscovery publication trust. probation (default) = never auto-publish. trusted = eligible events may be auto-published by the manual executor. Not used by Overdrive.';

alter table events
  add column if not exists decision_source text
    check (
      decision_source is null
      or decision_source in ('manual', 'automation')
    );

alter table events
  add column if not exists decision_reason text;

alter table events
  add column if not exists decision_at timestamptz;

comment on column events.decision_source is
  'Who made the moderation/publication decision: manual (human) or automation. Null on untouched pending/draft rows. Existing pre-M2 published rows are backfilled to manual.';

comment on column events.decision_reason is
  'Short machine-readable reason for the decision (e.g. trusted_source+eligible).';

comment on column events.decision_at is
  'When the decision_source decision was recorded.';

-- Protect the existing controlled published cohort as human/manual decisions.
update events
set
  decision_source = 'manual',
  decision_reason = 'legacy_manual',
  decision_at = coalesce(last_verified_at, updated_at, created_at)
where moderation_status = 'approved'
  and publication_status = 'published'
  and decision_source is null;

-- M2 trusted source (data-driven; executor never hardcodes this name).
update sources
set publication_policy = 'trusted',
    updated_at = now()
where name = 'City of Poway — Community Events'
  and experience = 'event_discovery';
