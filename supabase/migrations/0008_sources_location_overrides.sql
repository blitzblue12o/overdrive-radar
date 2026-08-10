-- Declarative per-facility geocode map for multi-campus sources (e.g. LibCal).
alter table sources
  add column if not exists location_overrides jsonb;

comment on column sources.location_overrides is
  'Optional declarative facility map: JSON array of {match, address, latitude?, longitude?}. Match is applied to event venue/address (case-insensitive substring). Takes precedence over geocode_override when matched.';
