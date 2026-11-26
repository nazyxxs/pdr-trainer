-- Друзі, профілі та батли.
-- Виконай у Supabase: SQL Editor -> New query -> встав весь файл -> Run.
-- Скрипт можна запускати повторно: він нічого не ламає і не видаляє дані.

-- ============ ПРОФІЛІ ============
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  avatar_url text,
  avatar_emoji text not null default '🚗',
  avatar_color text not null default '#2563eb',
  stats jsonb not null default '{}'::jsonb, -- публічна статистика для рейтингу
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: read" on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read" on public.profiles
  for select to authenticated using (true);
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
grant select, insert, update on public.profiles to authenticated;

-- ============ ДРУЗІ ============
create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
-- одна пара людей - один запис, незалежно від того, хто кому надіслав запит
create unique index if not exists friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
alter table public.friendships enable row level security;

drop policy if exists "friendships: read own" on public.friendships;
drop policy if exists "friendships: send" on public.friendships;
drop policy if exists "friendships: accept" on public.friendships;
drop policy if exists "friendships: remove" on public.friendships;
create policy "friendships: read own" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
create policy "friendships: send" on public.friendships
  for insert to authenticated with check (requester = auth.uid() and status = 'pending');
create policy "friendships: accept" on public.friendships
  for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
create policy "friendships: remove" on public.friendships
  for delete to authenticated using (auth.uid() in (requester, addressee));
grant select, insert, update, delete on public.friendships to authenticated;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- ============ БАТЛИ ============
create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references public.profiles (id) on delete cascade,
  guest uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished', 'declined', 'cancelled')),
  category text not null default 'B',
  question_ids text[] not null check (cardinality(question_ids) = 20),
  started_at timestamptz,
  finished_at timestamptz,
  winner uuid,
  host_score int,
  guest_score int,
  created_at timestamptz not null default now()
);
create index if not exists battles_host on public.battles (host, created_at desc);
create index if not exists battles_guest on public.battles (guest, created_at desc);
alter table public.battles enable row level security;

drop policy if exists "battles: read own" on public.battles;
drop policy if exists "battles: create with friend" on public.battles;
drop policy if exists "battles: update own" on public.battles;
create policy "battles: read own" on public.battles
  for select to authenticated using (auth.uid() in (host, guest));
create policy "battles: create with friend" on public.battles
  for insert to authenticated
  with check (host = auth.uid() and status = 'waiting' and public.are_friends(host, guest));
create policy "battles: update own" on public.battles
  for update to authenticated using (auth.uid() in (host, guest)) with check (auth.uid() in (host, guest));
grant select, insert, update on public.battles to authenticated;

-- час старту і фінішу ставить сервер, щоб у обох гравців був однаковий відлік
create or replace function public.battles_set_times()
returns trigger language plpgsql as $$
begin
  if new.status = 'active' and old.status = 'waiting' then
    new.started_at := now();
  end if;
  if new.status = 'finished' and old.status <> 'finished' then
    new.finished_at := now();
  end if;
  -- завершений батл більше не змінюється
  if old.status in ('finished', 'declined', 'cancelled') then
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists battles_set_times on public.battles;
create trigger battles_set_times before update on public.battles
  for each row execute function public.battles_set_times();

create table if not exists public.battle_answers (
  battle_id uuid not null references public.battles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  q_index int not null check (q_index between 0 and 19),
  answer int not null,
  correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (battle_id, user_id, q_index)
);
alter table public.battle_answers enable row level security;

drop policy if exists "battle_answers: read" on public.battle_answers;
drop policy if exists "battle_answers: answer" on public.battle_answers;
create policy "battle_answers: read" on public.battle_answers
  for select to authenticated using (
    exists (select 1 from public.battles b where b.id = battle_id and auth.uid() in (b.host, b.guest))
  );
create policy "battle_answers: answer" on public.battle_answers
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.battles b
      where b.id = battle_id and b.status = 'active' and auth.uid() in (b.host, b.guest)
    )
  );
grant select, insert on public.battle_answers to authenticated;

-- ============ REALTIME (живі оновлення) ============
do $$
declare t text;
begin
  foreach t in array array['battles', 'battle_answers', 'friendships'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============ АВАТАРИ (Storage) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatars: read" on storage.objects;
drop policy if exists "avatars: upload own" on storage.objects;
drop policy if exists "avatars: update own" on storage.objects;
drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: read" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');
create policy "avatars: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ ЧАС СЕРВЕРА ============
-- Щоб відлік батлу був однаковий у обох гравців, навіть якщо годинник на телефоні неточний.
create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.server_now() to authenticated;
