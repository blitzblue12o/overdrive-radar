-- Wave 2: trigram search within viewport, experience-isolated.
-- p_experience is required and non-optional (same invariant as get_events_in_viewport).

create or replace function search_events(
  p_experience experience_type,
  p_query text,
  p_min_lng float, p_min_lat float, p_max_lng float, p_max_lat float
) returns setof events as $$
  select * from events
  where experience = p_experience
    and publication_status = 'published'
    and moderation_status = 'approved'
    and event_status != 'cancelled'
    and location is not null
    and coalesce(ends_at, starts_at) >= now()
    and location && st_setsrid(st_makebox2d(st_point(p_min_lng,p_min_lat),
        st_point(p_max_lng,p_max_lat)),4326)::geography
    and (
      p_query is null or p_query = ''
      or similarity(title, p_query) > 0.2
      or similarity(coalesce(venue_name,''), p_query) > 0.2
    )
  order by
    case when p_query is null or p_query = '' then 0
         else greatest(similarity(title,p_query), similarity(coalesce(venue_name,''),p_query))
    end desc,
    starts_at asc
  limit 50;
$$ language sql stable;

grant execute on function search_events(
  experience_type, text, float, float, float, float
) to anon, authenticated;
