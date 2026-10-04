-- Booking requests (type = 'request') from landing pages, plus the web_form source.

alter table navet_items add column if not exists stage      text check (stage in ('new','answered','booked','declined'));
alter table navet_items add column if not exists contact    jsonb;
alter table navet_items add column if not exists event_date date;
alter table navet_items add column if not exists origin     text;

alter table navet_items drop constraint if exists navet_items_type_check;
alter table navet_items add constraint navet_items_type_check
  check (type in ('task','idea','commitment','note','waiting','reminder','request'));

alter table navet_items drop constraint if exists navet_items_source_check;
alter table navet_items add constraint navet_items_source_check
  check (source in ('manual','voice','google_tasks','outlook_mail','outlook_calendar','web_form'));
