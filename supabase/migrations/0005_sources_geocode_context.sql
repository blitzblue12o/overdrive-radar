-- Optional locality hint for Mapbox geocoding of ambiguous venue/room names.
-- Does not alter event address/venue fields — used only as geocoder query context.

alter table sources
  add column if not exists geocode_context text;

comment on column sources.geocode_context is
  'Optional locality hint appended to Mapbox geocode queries (e.g. ''Camarillo, CA''). Not persisted on events.';
