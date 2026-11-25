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

-- Захист вогника: сервер не викидає вже записані дні, навіть якщо стара версія сайту
-- надішле прогрес без них. Виняток - свідоме скидання кнопкою "Скинути все".
create or replace function public.progress_keep_days()
returns trigger language plpgsql as $$
declare
  merged jsonb := coalesce(new.data->'days', '{}'::jsonb);
  d text; devs jsonb; dev text; n jsonb;
begin
  -- якщо прогрес свідомо скинули кнопкою "Скинути все" - нічого не повертаємо
  if coalesce((new.data->>'resetAt')::bigint, 0) > coalesce((old.data->>'resetAt')::bigint, 0) then
    return new;
  end if;
  for d, devs in select key, value from jsonb_each(coalesce(old.data->'days', '{}'::jsonb)) loop
    for dev, n in select key, value from jsonb_each(devs) loop
      if coalesce((merged #>> array[d, dev])::int, 0) < n::int then
        merged := jsonb_set(merged, array[d], coalesce(merged->d, '{}'::jsonb) || jsonb_build_object(dev, n));
      end if;
    end loop;
  end loop;
  new.data := jsonb_set(new.data, '{days}', merged);
  return new;
end;
$$;
drop trigger if exists progress_keep_days on public.progress;
create trigger progress_keep_days before update on public.progress
  for each row execute function public.progress_keep_days();
