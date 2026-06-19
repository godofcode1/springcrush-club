-- Run this in Supabase SQL Editor after creating a project.
-- Then create a public Storage bucket named: artwork

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  bio text default '',
  specialty text default '',
  is_public boolean not null default false,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists bio text default '';
alter table public.profiles add column if not exists specialty text default '';
alter table public.profiles add column if not exists is_public boolean not null default false;

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
  updated_by_email text default '',
  updated_at timestamptz not null default now()
);

alter table public.meetings add column if not exists updated_by_email text default '';

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid references auth.users(id),
  created_by_email text default '',
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.announcements add column if not exists created_by_email text default '';
alter table public.announcements add column if not exists is_active boolean not null default true;
alter table public.announcements add column if not exists archived_at timestamptz;

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_attendance (
  meeting_id int not null default 1 references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

create table if not exists public.event_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  cover_url text default '',
  photo_urls text[] not null default '{}',
  album_url text default '',
  created_by uuid references auth.users(id),
  created_by_email text default '',
  created_at timestamptz not null default now()
);

alter table public.event_albums add column if not exists photo_urls text[] not null default '{}';

create table if not exists public.monthly_themes (
  id uuid primary key default gen_random_uuid(),
  month_label text not null,
  title text not null,
  description text default '',
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_by_email text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.featured_artists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  bio text default '',
  specialty text default '',
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_by_email text default '',
  created_at timestamptz not null default now()
);

alter table public.featured_artists add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create table if not exists public.artwork_comments (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text default '',
  email text default '',
  body text not null,
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
alter table public.site_settings enable row level security;
alter table public.meeting_attendance enable row level security;
alter table public.event_albums enable row level security;
alter table public.monthly_themes enable row level security;
alter table public.featured_artists enable row level security;
alter table public.artwork_comments enable row level security;

drop policy if exists "Profiles are readable by signed-in users" on public.profiles;
create policy "Profiles are readable by signed-in users"
on public.profiles for select
to anon, authenticated
using (is_public = true or auth.role() = 'authenticated');

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

drop policy if exists "Admins can delete artwork" on public.artworks;
create policy "Admins can delete artwork"
on public.artworks for delete
to authenticated
using (public.current_user_is_admin());

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

drop policy if exists "Admins can delete meetings" on public.meetings;
create policy "Admins can delete meetings"
on public.meetings for delete
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read own attendance and admins can read all" on public.meeting_attendance;
create policy "Members can read own attendance and admins can read all"
on public.meeting_attendance for select
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Members can mark own attendance" on public.meeting_attendance;
create policy "Members can mark own attendance"
on public.meeting_attendance for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Members can remove own attendance" on public.meeting_attendance;
create policy "Members can remove own attendance"
on public.meeting_attendance for delete
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Event albums are public" on public.event_albums;
create policy "Event albums are public"
on public.event_albums for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage event albums" on public.event_albums;
create policy "Admins can manage event albums"
on public.event_albums for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Monthly themes are public" on public.monthly_themes;
create policy "Monthly themes are public"
on public.monthly_themes for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage monthly themes" on public.monthly_themes;
create policy "Admins can manage monthly themes"
on public.monthly_themes for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Featured artists are public" on public.featured_artists;
create policy "Featured artists are public"
on public.featured_artists for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage featured artists" on public.featured_artists;
create policy "Admins can manage featured artists"
on public.featured_artists for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Artwork comments are public" on public.artwork_comments;
create policy "Artwork comments are public"
on public.artwork_comments for select
to anon, authenticated
using (true);

drop policy if exists "Members can comment" on public.artwork_comments;
create policy "Members can comment"
on public.artwork_comments for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Members can delete own comments and admins can delete all" on public.artwork_comments;
create policy "Members can delete own comments and admins can delete all"
on public.artwork_comments for delete
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Announcements are public" on public.announcements;
create policy "Announcements are public"
on public.announcements for select
to anon, authenticated
using (true);

drop policy if exists "Site settings are public" on public.site_settings;
create policy "Site settings are public"
on public.site_settings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage site settings" on public.site_settings;
create policy "Admins can manage site settings"
on public.site_settings for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Admins can publish announcements" on public.announcements;
create policy "Admins can publish announcements"
on public.announcements for insert
to authenticated
with check (public.current_user_is_admin());

drop policy if exists "Admins can archive announcements" on public.announcements;
create policy "Admins can archive announcements"
on public.announcements for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

insert into public.meetings (id, theme, meeting_date, meeting_time, room, notes)
values (1, 'Open studio + first submissions', current_date + 7, '16:30', 'Art room', 'Bring a sketch, photo, or unfinished idea.')
on conflict (id) do nothing;

insert into public.site_settings (key, value)
values ('animations_enabled', 'true'::jsonb)
on conflict (key) do nothing;

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

drop policy if exists "Admins delete artwork bucket files" on storage.objects;
create policy "Admins delete artwork bucket files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'artwork'
  and public.is_admin(auth.uid())
);

-- Make the signed-in account with this email the first admin:
-- update public.profiles set role = 'admin' where id = (
--   select id from auth.users where email = 'you@example.com'
-- );

-- Optional but useful for real-time updates in hosted projects.
-- These blocks are safe to rerun if the table is already in the publication.
do $$
begin
  alter publication supabase_realtime add table public.artworks;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.meetings;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.meeting_attendance;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.site_settings;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.event_albums;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.monthly_themes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.featured_artists;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.artwork_comments;
exception when duplicate_object then null;
end $$;
