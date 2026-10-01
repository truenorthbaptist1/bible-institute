-- ============================================================================
-- Migration: My Profile (personal details + profile photo) — Oct 2026
--
-- For the LIVE database. Paste this whole file into Supabase → SQL Editor →
-- New query → Run. It only ADDS things (new columns, a new photo bucket,
-- new privacy rules) and is safe to run more than once. No existing data
-- is changed or removed.
--
-- (schema.sql already includes all of this, for a brand-new setup.)
-- ============================================================================

-- Profile details each person fills in on their own My Profile page.
-- (Added Oct 2026. "add column if not exists" makes this safe to re-run.)
--   Seen by: the person themself and faculty — everything.
--            classmates and other students — only name, photo, home church,
--            and "about me" (through visible_people() below). Never phone,
--            address, or email.
alter table public.profiles
  add column if not exists phone        text not null default '' check (length(phone) <= 40),
  add column if not exists address_line text not null default '' check (length(address_line) <= 200),
  add column if not exists city         text not null default '' check (length(city) <= 80),
  add column if not exists state        text not null default '' check (length(state) <= 40),
  add column if not exists postal_code  text not null default '' check (length(postal_code) <= 20),
  add column if not exists home_church  text not null default '' check (length(home_church) <= 120),
  add column if not exists bio          text not null default '' check (length(bio) <= 1000),
  -- The photo's path inside the private "avatars" storage bucket. It must
  -- sit in the person's own folder (<their id>/...), so nobody can point
  -- their profile at someone else's picture.
  add column if not exists avatar_path  text check (avatar_path is null or avatar_path like (id::text || '/%'));


-- Can the signed-in person see this other person at all? Faculty see
-- everyone; everyone sees themself and every faculty member; students also
-- see classmates who share a course with them (so discussion replies show
-- who wrote them). Used for names, profile photos, and "about me".
create or replace function public.can_see_person(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and (
    public.is_faculty()
    or p_id = auth.uid()
    or exists (select 1 from profiles where id = p_id and role = 'faculty')
    or exists (
      select 1 from enrollments e1
      join enrollments e2 on e1.course_id = e2.course_id
      where e1.student_id = auth.uid() and e2.student_id = p_id
    )
  )
$$;

-- The public-facing part of everyone a person can see: name, role, photo,
-- home church, and "about me". Never email, phone, or address.
drop function if exists public.visible_people();
create or replace function public.visible_people()
returns table (id uuid, name text, role text, super_admin boolean,
               avatar_path text, home_church text, bio text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.super_admin, p.avatar_path, p.home_church, p.bio
  from profiles p
  where public.can_see_person(p.id)
$$;


-- A private bucket for profile photos (the site shrinks each photo to a
-- small square JPEG before uploading, so 2 MB is generous).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tnbbi_avatars_read     on storage.objects;
drop policy if exists tnbbi_avatars_insert   on storage.objects;
drop policy if exists tnbbi_avatars_update   on storage.objects;
drop policy if exists tnbbi_avatars_delete   on storage.objects;

-- Profile photos: you can see the photo of anyone you can see by name.
-- You manage your own; faculty can also add or remove anyone's (e.g. to
-- help someone who isn't comfortable with uploads, or take one down).
create or replace function public.avatar_owner(p_name text) returns uuid
language sql stable as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f-]{36}$'
              then ((storage.foldername(p_name))[1])::uuid end
$$;
create policy tnbbi_avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_see_person(public.avatar_owner(name)));
create policy tnbbi_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_active_user()
    and (public.avatar_owner(name) = auth.uid() or public.is_faculty()));
create policy tnbbi_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_active_user()
    and (public.avatar_owner(name) = auth.uid() or public.is_faculty()));
create policy tnbbi_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_active_user()
    and (public.avatar_owner(name) = auth.uid() or public.is_faculty()));


revoke execute on function public.visible_people() from public, anon;
revoke execute on function public.can_see_person(uuid) from public, anon;
grant execute on function public.visible_people() to authenticated;
grant execute on function public.can_see_person(uuid) to authenticated;
