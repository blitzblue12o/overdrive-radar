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

## 7. M1 publication-policy dry-run (read-only)

Evaluates EventDiscovery ICS `pending`/`draft` rows with the deterministic
eligibility policy. Does **not** approve, publish, reject, or otherwise mutate
moderation/publication state.

```bash
npx tsx --tsconfig tsconfig.json scripts/dry-run-publication-policy.ts
npx tsx --tsconfig tsconfig.json scripts/dry-run-publication-policy.ts --json=tmp/m1-dry-run.json
```

`eligible` here means event-level deterministic rules pass — **not** that the
event is authorized for auto-publish (source trust is M2).

## 8. M2 controlled trusted-source auto-publication (manual only)

Publishes **only** from sources with `publication_policy = 'trusted'`, and only
events the M1 evaluator marks `eligible`. Hard M2 ceiling: `--limit` ≤ 10.
Preview is the default (zero writes); mutation requires `--execute`.

```bash
# Preview (required before execute)
npx tsx --tsconfig tsconfig.json scripts/publish-eligible-events.ts \
  --source="City of Poway — Community Events" --limit=10

# Execute (only after preview looks correct)
npx tsx --tsconfig tsconfig.json scripts/publish-eligible-events.ts \
  --source="City of Poway — Community Events" --limit=10 --execute
```

Automated rows set `decision_source = 'automation'`. Human/manual decisions use
`decision_source = 'manual'` (including the pre-M2 published cohort backfill).
Normal sync must not overwrite moderation/publication/decision provenance.

## Rules

- Never auto-approve from the sync job — this runbook is intentional human review.
- Prefer rejecting clear junk (cancelled meetings, empty placeholders) over publishing.
- If `possible_duplicate_of` is set, open both rows before approving.
- After approval, confirm the event appears on `/` or `/events` for the matching experience.
