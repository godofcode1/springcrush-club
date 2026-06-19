-- Run this in Supabase SQL Editor after creating a project.
-- Then create a public Storage bucket named: artwork

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text not null default '';

create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist_name text not null,
  description text default '',
  image_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.artworks add column if not exists reviewed_by uuid references auth.users(id);
alter table public.artworks add column if not exists reviewed_at timestamptz;

create table if not exists public.meetings (
  id int primary key default 1 check (id = 1),
  theme text not null,
  meeting_date date not null,
  meeting_time time not null,
  room text not null,
  notes text default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'member'),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.set_member_role_by_email(member_email text, new_role text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if not public.current_user_is_admin() then
    raise exception 'Only admins can change member roles.';
  end if;

  if new_role not in ('member', 'admin') then
    raise exception 'Role must be member or admin.';
  end if;

  update public.profiles
  set role = new_role
  where lower(email) = lower(member_email)
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'No signed-up member found with that email.';
  end if;

  return updated_profile;
end;
$$;

update public.profiles
set email = auth.users.email
from auth.users
where public.profiles.id = auth.users.id
  and public.profiles.email = '';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.artworks enable row level security;
alter table public.meetings enable row level security;
alter table public.announcements enable row level security;

drop policy if exists "Profiles are readable by signed-in users" on public.profiles;
create policy "Profiles are readable by signed-in users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Members can update their own profile name" on public.profiles;
create policy "Members can update their own profile name"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "Admins can update member roles" on public.profiles;
create policy "Admins can update member roles"
on public.profiles for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Approved artwork is public" on public.artworks;
create policy "Approved artwork is public"
on public.artworks for select
to anon, authenticated
using (status = 'approved');

drop policy if exists "Members can read their own artwork" on public.artworks;
create policy "Members can read their own artwork"
on public.artworks for select
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Members can create pending artwork" on public.artworks;
create policy "Members can create pending artwork"
on public.artworks for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Members can edit own artwork back to pending" on public.artworks;
create policy "Members can edit own artwork back to pending"
on public.artworks for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Admins can moderate artwork" on public.artworks;
create policy "Admins can moderate artwork"
on public.artworks for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Meetings are public" on public.meetings;
create policy "Meetings are public"
on public.meetings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage meetings" on public.meetings;
create policy "Admins can manage meetings"
on public.meetings for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Announcements are public" on public.announcements;
create policy "Announcements are public"
on public.announcements for select
to anon, authenticated
using (true);

drop policy if exists "Admins can publish announcements" on public.announcements;
create policy "Admins can publish announcements"
on public.announcements for insert
to authenticated
with check (public.current_user_is_admin());

insert into public.meetings (id, theme, meeting_date, meeting_time, room, notes)
values (1, 'Open studio + first submissions', current_date + 7, '16:30', 'Art room', 'Bring a sketch, photo, or unfinished idea.')
on conflict (id) do nothing;

-- Storage policy for a public bucket named "artwork".
-- Keep the bucket itself public for image URLs, but do not add a broad SELECT
-- policy on storage.objects because that lets clients list every file.
drop policy if exists "Artwork images are public" on storage.objects;
drop policy if exists "Members upload artwork to their folder" on storage.objects;
create policy "Members upload artwork to their folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'artwork'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Make the signed-in account with this email the first admin:
-- update public.profiles set role = 'admin' where id = (
--   select id from auth.users where email = 'you@example.com'
-- );

-- Optional but useful for real-time updates in hosted projects:
alter publication supabase_realtime add table public.artworks;
alter publication supabase_realtime add table public.meetings;
alter publication supabase_realtime add table public.announcements;
