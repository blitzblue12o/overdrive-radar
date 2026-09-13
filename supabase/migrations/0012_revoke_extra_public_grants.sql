-- Tighten leftover default grants; RLS remains primary authorization.
-- Keep SELECT only for anon/authenticated on public read tables.

revoke truncate, trigger, references on table public.events from anon, authenticated;
revoke truncate, trigger, references on table public.sources from anon, authenticated;
