-- Серверне злиття прогресу (замінює тригер progress_keep_days).
-- Виконай у Supabase: SQL Editor -> New query -> встав файл -> Run.
--
-- Навіщо: якщо два пристрої синхронізуються майже одночасно або стара версія сайту
-- надсилає застарілі дані, сервер не дасть їм затерти вже збережене:
--   q      - для кожного питання лишається новіша відповідь
--   exams  - іспити об'єднуються
--   days   - лічильники вогника: максимум для кожного пристрою
--   settings - перемагають новіші
-- Виняток: свідоме скидання кнопкою "Скинути все" (новіший resetAt).
create or replace function public.progress_merge()
returns trigger language plpgsql as $$
declare
  o jsonb := coalesce(old.data, '{}'::jsonb);
  n jsonb := coalesce(new.data, '{}'::jsonb);
  reset_at bigint;
  q jsonb;
  days jsonb;
  exams jsonb;
  d text; devs jsonb; dev text; cnt jsonb;
begin
  if coalesce((n->>'resetAt')::bigint, 0) > coalesce((o->>'resetAt')::bigint, 0) then
    return new;
  end if;
  reset_at := greatest(coalesce((n->>'resetAt')::bigint, 0), coalesce((o->>'resetAt')::bigint, 0));

  -- відповіді на питання: для кожного питання перемагає новіша (з урахуванням скидання)
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into q
  from (
    select distinct on (key) key, value
    from (
      select key, value from jsonb_each(coalesce(n->'q', '{}'::jsonb))
      union all
      select key, value from jsonb_each(coalesce(o->'q', '{}'::jsonb))
    ) both_sides
    where coalesce((value->>'t')::bigint, 0) > reset_at
    order by key, coalesce((value->>'t')::bigint, 0) desc
  ) newest;

  -- дні для вогника: максимум по кожному пристрою
  days := coalesce(n->'days', '{}'::jsonb);
  for d, devs in select key, value from jsonb_each(coalesce(o->'days', '{}'::jsonb)) loop
    for dev, cnt in select key, value from jsonb_each(devs) loop
      if coalesce((days #>> array[d, dev])::int, 0) < cnt::int then
        days := jsonb_set(days, array[d], coalesce(days->d, '{}'::jsonb) || jsonb_build_object(dev, cnt));
      end if;
    end loop;
  end loop;

  -- іспити: об'єднання за часом, найновіші 200
  select coalesce(jsonb_agg(e order by (e->>'t')::bigint desc), '[]'::jsonb) into exams
  from (
    select distinct on (e->>'t') e
    from jsonb_array_elements(coalesce(n->'exams', '[]'::jsonb) || coalesce(o->'exams', '[]'::jsonb)) e
    where coalesce((e->>'t')::bigint, 0) > reset_at
    order by e->>'t'
    limit 1000
  ) s;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into exams
  from (select e from jsonb_array_elements(exams) e limit 200) s;

  new.data := n || jsonb_build_object('q', q, 'days', days, 'exams', exams, 'resetAt', reset_at);

  -- налаштування: перемагають новіші
  if coalesce((o->>'settingsT')::bigint, 0) > coalesce((n->>'settingsT')::bigint, 0) then
    new.data := new.data || jsonb_build_object('settings', o->'settings', 'settingsT', o->'settingsT');
  end if;
  return new;
end;
$$;

drop trigger if exists progress_keep_days on public.progress;
drop trigger if exists progress_merge on public.progress;
create trigger progress_merge before update on public.progress
  for each row execute function public.progress_merge();
