# Moderation runbook (Wave 3 interim)

Ingested events land as `moderation_status = 'pending'` and
`publication_status = 'draft'`. They are **not** visible to the public app until
approved. Use the SQL below in the Supabase SQL editor (or `psql`) until Wave 4
ships a moderation UI.

Run these against the **live** project when reviewing production ingestion, or
local Supabase when testing.

## 1. Review pending ingested events

```sql
select
  id,
  title,
  experience,
  source_type,
  source_url,
  starts_at,
  venue_name,
  address,
  possible_duplicate_of,
  source_metadata->>'source_name' as source_name,
  created_at
from events
where moderation_status = 'pending'
order by created_at desc
limit 100;
```

## 2. Inspect a possible duplicate pair

```sql
select id, title, starts_at, venue_name, source_type, source_url, moderation_status, publication_status
from events
where id in ('<pending-id>', '<possible_duplicate_of-id>');
```

## 3. Approve one event (publish to the map)

```sql
update events
set
  moderation_status = 'approved',
  publication_status = 'published',
  last_verified_at = now()
where id = '<id>'
  and moderation_status = 'pending';
```

## 4. Reject one event

```sql
update events
set moderation_status = 'rejected'
where id = '<id>'
  and moderation_status = 'pending';
```

## 5. Bulk-approve a clean batch from one source (use carefully)

```sql
update events
set
  moderation_status = 'approved',
  publication_status = 'published',
  last_verified_at = now()
where moderation_status = 'pending'
  and possible_duplicate_of is null
  and source_metadata->>'source_name' = 'Thousand Oaks Library — Events Calendar'
  and starts_at > now();
```

## 6. Check source sync health

```sql
select
  name,
  experience,
  adapter_type,
  active,
  last_synced_at,
  last_sync_status,
  last_sync_error
from sources
order by experience, name;
```

## Rules

- Never auto-approve from the sync job — this runbook is intentional human review.
- Prefer rejecting clear junk (cancelled meetings, empty placeholders) over publishing.
- If `possible_duplicate_of` is set, open both rows before approving.
- After approval, confirm the event appears on `/` or `/events` for the matching experience.
