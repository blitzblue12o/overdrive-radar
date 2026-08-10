-- LibraryCalendar (Communico/Drupal) ingestion adapter.
alter type source_type add value if not exists 'librarycalendar';

alter table sources drop constraint if exists sources_adapter_type_check;
alter table sources
  add constraint sources_adapter_type_check
  check (adapter_type in ('ics', 'rss', 'motorsportreg', 'librarycalendar'));
