-- Same-source rows already have unique source_id identities.
-- Soft day+title dedupe must only compare across different sources.

create or replace function find_possible_duplicates(
  p_event_id uuid,
  p_similarity_threshold real default 0.4
)
returns table (
  candidate_id uuid,
  candidate_title text,
  title_similarity real,
  same_day boolean,
  venue_similarity real
) as $$
  select
    e.id as candidate_id,
    e.title as candidate_title,
    similarity(e.title, ev.title) as title_similarity,
    (date_trunc('day', e.starts_at) = date_trunc('day', ev.starts_at)) as same_day,
    coalesce(similarity(e.venue_name, ev.venue_name), 0) as venue_similarity
  from events e
  cross join (select * from events where id = p_event_id) ev
  where e.id != ev.id
    and e.experience = ev.experience
    and split_part(coalesce(e.source_id, ''), ':', 1)
        is distinct from split_part(coalesce(ev.source_id, ''), ':', 1)
    and similarity(e.title, ev.title) > p_similarity_threshold
    and date_trunc('day', e.starts_at) = date_trunc('day', ev.starts_at)
  order by title_similarity desc
  limit 5;
$$ language sql stable;

-- Clear false-positive same-source flags on upcoming pending/draft rows only.
update events e
set possible_duplicate_of = null
from events p
where e.possible_duplicate_of = p.id
  and e.starts_at > now()
  and e.moderation_status = 'pending'
  and e.publication_status = 'draft'
  and split_part(coalesce(e.source_id, ''), ':', 1)
      = split_part(coalesce(p.source_id, ''), ':', 1);
