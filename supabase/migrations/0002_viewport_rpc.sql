-- Helper RPC for Mapbox viewport queries (anon-safe, SECURITY INVOKER).
-- Mirrors the canonical example query in 0001_events_schema.sql.

-- Explicit grants required when api.auto_expose_new_tables is unset/false.
grant select on table events to anon, authenticated;

create or replace function get_events_in_viewport(
  p_experience experience_type,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision
)
returns setof events
language sql
stable
security invoker
as $$
  select *
  from events
  where experience = p_experience
    and publication_status = 'published'
    and moderation_status = 'approved'
    and event_status != 'cancelled'
    and location is not null
    and coalesce(ends_at, starts_at) >= now()
    and location && st_setsrid(
          st_makebox2d(
            st_point(p_min_lng, p_min_lat),
            st_point(p_max_lng, p_max_lat)
          ),
          4326
        )::geography
  order by starts_at asc;
$$;

grant execute on function get_events_in_viewport(
  experience_type, double precision, double precision, double precision, double precision
) to anon, authenticated;
