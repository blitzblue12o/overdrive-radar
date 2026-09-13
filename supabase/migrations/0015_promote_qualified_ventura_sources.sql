-- Promote individually qualified Ventura Overdrive sources after
-- 3 clean sync cycles, stable recurrence IDs, and geocode 100%.
-- Fairgrounds remains probation (mixed calendar; filter proven but
-- higher ongoing false-positive risk until more auto cycles accrue).
-- Ventura Cars & Coffee remains probation (directory provenance).

update sources
set publication_policy = 'trusted',
    trusted_at = coalesce(trusted_at, now()),
    updated_at = now()
where experience = 'overdrive'
  and publication_policy = 'probation'
  and name in (
    'Camarillo Old Town Car Cruises',
    'Conejo Valley Cars & Coffee'
  );
