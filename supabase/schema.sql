-- Виконай цей SQL у Supabase: SQL Editor -> New query -> Run

create table if not exists public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: кожен бачить і змінює лише свій прогрес
alter table public.progress enable row level security;

drop policy if exists "own progress: select" on public.progress;
drop policy if exists "own progress: insert" on public.progress;
drop policy if exists "own progress: update" on public.progress;

create policy "own progress: select" on public.progress
  for select using (auth.uid() = user_id);
create policy "own progress: insert" on public.progress
  for insert with check (auth.uid() = user_id);
create policy "own progress: update" on public.progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Доступ до таблиці для залогінених користувачів через Data API
-- (у нових проєктах Supabase він не видається автоматично -> "permission denied for table progress")
grant usage on schema public to authenticated;
grant select, insert, update on table public.progress to authenticated;
