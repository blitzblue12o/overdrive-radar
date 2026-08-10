-- Optional canonical facility address used as the Mapbox geocode target
-- instead of per-event room/location nicknames. Room text stays on the event.

alter table sources
  add column if not exists geocode_override text;

comment on column sources.geocode_override is
  'Optional canonical physical address for Mapbox geocoding. When set, used instead of event LOCATION (room names preserved on the event). Virtual locations still win.';
