-- Navet schema. All access goes through the Next.js server using the
-- service role key; RLS is enabled with no policies so the anon key
-- cannot read anything.

create table if not exists navet_projects (
  user_id      text        not null,
  id           text        not null,
  name         text        not null,
  description  text,
  aliases      text[]      not null default '{}',
  color        text        not null default '#2F5D4E',
  archived     boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists navet_items (
  user_id              text        not null,
  id                   text        not null,
  title                text        not null,
  description          text,
  type                 text        not null check (type in ('task','idea','commitment','note','waiting','reminder')),
  status               text        not null check (status in ('inbox','open','waiting','done','archived')),
  source               text        not null check (source in ('manual','voice','google_tasks','outlook_mail','outlook_calendar')),
  project_id           text,
  due_date             date,
  due_time             time,
  priority             text        not null default 'normal' check (priority in ('low','normal','high')),
  estimated_time       integer,
  waiting_for          text,
  person               text,
  last_follow_up       date,
  external_id          text,
  external_provider    text,
  external_list_id     text,
  external_updated_at  text,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists navet_items_external_idx on navet_items (user_id, external_provider, external_id);
create index if not exists navet_items_status_idx on navet_items (user_id, status);

create table if not exists navet_kv (
  user_id    text        not null,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table navet_projects enable row level security;
alter table navet_items    enable row level security;
alter table navet_kv       enable row level security;
