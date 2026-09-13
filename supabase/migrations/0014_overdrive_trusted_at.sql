-- Overdrive may use publication_policy; record when a source becomes trusted.

alter table sources
  add column if not exists trusted_at timestamptz;

comment on column sources.publication_policy is
  'Publication trust for EventDiscovery and Overdrive. probation (default) = never auto-publish. trusted = eligible pending/draft events may be auto-published by the M2 executor.';

comment on column sources.trusted_at is
  'When publication_policy was set to trusted (null while probation).';
