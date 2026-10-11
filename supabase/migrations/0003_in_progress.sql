-- Task status "Pågår" (in_progress), between "Att göra" (open) and "Klart" (done).
-- Only widens the allowed values; no existing rows are changed.

alter table navet_items drop constraint if exists navet_items_status_check;
alter table navet_items add constraint navet_items_status_check
  check (status in ('inbox','open','in_progress','waiting','done','archived'));
