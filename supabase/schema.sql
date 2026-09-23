-- SanaBrief demo schema. Run once in the test project's Supabase SQL Editor.
-- No existing tables are deleted. Browser roles receive no table access.
create table if not exists public.tasks (
  id uuid primary key,
  owner_id text not null,
  payload jsonb not null,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  constraint tasks_payload_id check (payload ->> 'id' = id::text)
);
create index if not exists tasks_owner_idx on public.tasks(owner_id);

create table if not exists public.teams (
  id uuid primary key,
  name text not null,
  interests text[] not null default '{}',
  skills text[] not null default '{}',
  technologies text[] not null default '{}'
);

create table if not exists public.proposals (
  id uuid primary key,
  task_id uuid not null references public.tasks(id),
  team_id uuid not null references public.teams(id),
  payload jsonb not null,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  constraint proposals_payload_id check (payload ->> 'id' = id::text)
);
create index if not exists proposals_task_idx on public.proposals(task_id);
create index if not exists proposals_team_idx on public.proposals(team_id);

alter table public.tasks enable row level security;
alter table public.teams enable row level security;
alter table public.proposals enable row level security;
revoke all on public.tasks, public.teams, public.proposals from anon, authenticated;
grant select, insert, update, delete on public.tasks, public.teams, public.proposals to service_role;

-- Five synthetic demo profiles. XP is derived from confirmed proposal stages.
insert into public.teams(id, name, interests, skills, technologies) values
('00000000-0000-4000-8000-000000000001', 'WebStep', '{Торговля}', '{Интерфейсы,API}', '{TypeScript,React}'),
('00000000-0000-4000-8000-000000000002', 'DataLab', '{Образование}', '{Аналитика,SQL}', '{Python,PostgreSQL}'),
('00000000-0000-4000-8000-000000000003', 'LogiCode', '{Логистика}', '{Автоматизация}', '{TypeScript,Node.js}'),
('00000000-0000-4000-8000-000000000004', 'MakerTeam', '{Производство}', '{Прототипирование}', '{React,SQL}'),
('00000000-0000-4000-8000-000000000005', 'ServiceFlow', '{Услуги}', '{Проектирование,API}', '{TypeScript,Next.js}')
on conflict (id) do nothing;
