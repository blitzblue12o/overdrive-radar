-- Ventura Overdrive sources: Tribe Events + HTML series adapters.

alter type source_type add value if not exists 'tribe_events';
alter type source_type add value if not exists 'html_series';

alter table sources drop constraint if exists sources_adapter_type_check;

alter table sources
  add constraint sources_adapter_type_check
  check (
    adapter_type in (
      'ics',
      'rss',
      'motorsportreg',
      'librarycalendar',
      'tribe_events',
      'html_series'
    )
  );
