-- Пояснення до питань від AI.
-- Виконай у Supabase: SQL Editor -> New query -> встав весь файл -> Run.

-- Кеш пояснень: кожне питання генерується один раз, далі читається звідси.
-- Записує сюди лише серверна функція explain (через service role).
create table if not exists public.explanations (
  question_id text primary key,
  text text not null,
  model text,
  created_at timestamptz not null default now()
);
alter table public.explanations enable row level security;
drop policy if exists "explanations: read" on public.explanations;
create policy "explanations: read" on public.explanations
  for select to anon, authenticated using (true);
grant select on public.explanations to anon, authenticated;

-- Скарги "пояснення неправильне": можна переглянути в Table Editor
-- і видалити поганий запис з explanations, тоді він згенерується заново.
create table if not exists public.explanation_reports (
  question_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);
alter table public.explanation_reports enable row level security;
drop policy if exists "explanation_reports: add own" on public.explanation_reports;
drop policy if exists "explanation_reports: read own" on public.explanation_reports;
create policy "explanation_reports: add own" on public.explanation_reports
  for insert to authenticated with check (user_id = auth.uid());
create policy "explanation_reports: read own" on public.explanation_reports
  for select to authenticated using (user_id = auth.uid());
grant select, insert on public.explanation_reports to authenticated;

-- Серверна функція пише в кеш від імені service_role.
-- У нових проєктах Supabase ці права не видаються автоматично.
grant select, insert, update on table public.explanations to service_role;
grant select on table public.explanation_reports to service_role;
