-- Oct 23, 2026 review fixes — the changed parts of schema.sql only.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run twice.
-- (It is exactly what changed in schema.sql on Oct 23; tested on a copy of the live database.)
begin;
drop function if exists public.visible_people();
create or replace function public.visible_people()
returns table (id uuid, name text, role text, super_admin boolean,
               avatar_path text, home_church text, bio text, status text)
language sql stable security definer set search_path = public as $$
  -- status (Oct 23, 2026): so a student can tell a teacher whose account was
  -- turned off — that course's messages then go to the Admins.
  select p.id, p.name, p.role, p.super_admin, p.avatar_path, p.home_church, p.bio, p.status
  from profiles p
  where public.can_see_person(p.id)
$$;
revoke execute on function public.visible_people() from public, anon;
grant execute on function public.visible_people() to authenticated;
create or replace function public.library_checkout(p_token text, p_name text, p_email text, p_items jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v library_borrowers; it jsonb; v_book bigint; v_isbn text; v_title text; v_author text;
  v_due date := public.local_today() + 14; n int := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one book.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 10 then
    raise exception 'Up to 10 books at a time, please.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Please enter your name.' using errcode = '22023'; end if;
  if coalesce(p_email, '') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Please enter your email address, so we can remind you when it''s due.' using errcode = '22023';
  end if;

  select * into v from library_borrowers where token = p_token and length(coalesce(p_token, '')) >= 32;
  if v.id is null then
    insert into library_borrowers (token, name, email)
    values (public.library_new_key(), trim(p_name), lower(trim(p_email))) returning * into v;
  else
    update library_borrowers set name = trim(p_name), email = lower(trim(p_email)), last_seen_at = now()
     where id = v.id returning * into v;
  end if;
  -- A little guard against a prank flood: 30 books a day per phone.
  if (select count(*) from library_loans where borrower_id = v.id and out_at > now() - interval '1 day')
     + jsonb_array_length(p_items) > 30 then
    raise exception 'That''s a lot of books for one day. Please see the librarian.' using errcode = '22023';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_isbn := nullif(upper(regexp_replace(coalesce(it->>'isbn', ''), '[^0-9Xx]', '', 'g')), '');
    if v_isbn is not null and length(v_isbn) not in (10, 13) then v_isbn := null; end if;
    v_book := null;
    if it ? 'book' then
      select id into v_book from library_books where id = (it->>'book')::bigint;
      if v_book is null then raise exception 'That book isn''t on the list any more.' using errcode = '22023'; end if;
    else
      v_title := left(trim(coalesce(it->>'title', '')), 300);
      v_author := left(trim(coalesce(it->>'author', '')), 200);
      if length(v_title) < 1 then raise exception 'Please type the book''s title.' using errcode = '22023'; end if;
      -- Already on the list under the same title (and author, when given)?
      select id into v_book from library_books
       where library_norm(title) = library_norm(v_title)
         and (v_author = '' or author = '' or library_norm(author) = library_norm(v_author))
       order by (source = 'list') desc, id limit 1;
      if v_book is null then
        insert into library_books (title, author, source, reviewed, photo_path, isbns)
        values (v_title, v_author, 'borrower', false,
                case when coalesce(it->>'photo', '') ~ '^new/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$' then it->>'photo' end,
                case when v_isbn is null then '{}'::text[] else array[v_isbn] end)
        returning id into v_book;
      end if;
    end if;
    if v_isbn is not null then
      update library_books set isbns = array_append(isbns, v_isbn)
       where id = v_book and not (isbns @> array[v_isbn]) and cardinality(isbns) < 10;
    end if;
    -- One copy of each book: if it's in this person's hands, whoever had it
    -- before must have put it back (they stop getting reminders). That
    -- includes this same person borrowing it again (fixed Oct 23, 2026).
    update library_loans set returned_at = now(),
           returned_by = case when borrower_id = v.id then 'borrower' else 'next_borrower' end
     where book_id = v_book and returned_at is null
       and (select copies from library_books where id = v_book) <= 1;
    insert into library_loans (book_id, borrower_id, due_on, renew_token)
    values (v_book, v.id, v_due, public.library_new_key());
    n := n + 1;
  end loop;
  return public.library_my_books(v.token) || jsonb_build_object('token', v.token, 'checked_out', n, 'due_on', v_due);
end $$;
-- -- Review fixes (Oct 23, 2026). Safe to re-run on its own.
-- ===========================================================================
-- An Admin recording final grades for a course they don't teach: what the
-- grade formula needs (each student's status and score per assignment, and
-- attendance), so the form can suggest the real final grade. Only for the
-- course's teacher or an Admin; never shown as a grade book.
create or replace function public.course_grade_inputs(p_course text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.manages_course(p_course) then raise exception 'Only this course''s teacher or an Admin can do that.'; end if;
  return jsonb_build_object(
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('assignment_id', s.assignment_id, 'student_id', s.student_id,
                      'status', s.status, 'score', s.score))
                    from submissions s join assignments a on a.id = s.assignment_id where a.course_id = p_course), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('class_date', d.class_date, 'held', d.held, 'teacher_taken', d.teacher_taken))
                    from attendance_days d where d.course_id = p_course), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('class_date', m.class_date, 'student_id', m.student_id, 'status', m.status))
                    from attendance m where m.course_id = p_course), '[]'::jsonb));
end $$;

-- How much private material a course holds, as counts only (no content):
-- private messages, and turned-in work per assignment. Lets an Admin who
-- doesn't teach the course be warned before archiving or deleting.
create or replace function public.course_private_counts(p_course text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.manages_course(p_course) then raise exception 'Only this course''s teacher or an Admin can do that.'; end if;
  return jsonb_build_object(
    'messages', (select count(*) from messages where course_id = p_course),
    'turned_in', coalesce((select jsonb_object_agg(x.assignment_id, x.n) from (
        select s.assignment_id, count(*) as n from submissions s join assignments a on a.id = s.assignment_id
         where a.course_id = p_course and s.status in ('submitted','graded') group by s.assignment_id) x), '{}'::jsonb));
end $$;

-- Every lecture's class day as ONE object ({lesson id: date}). A single row,
-- so Supabase's 1,000-rows-per-request limit can't cut it short.
create or replace function public.visible_lesson_dates_json() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(x.lesson_id, x.class_date), '{}'::jsonb) from public.visible_lesson_dates() x
$$;

revoke execute on function public.course_grade_inputs(text) from public, anon;
revoke execute on function public.course_private_counts(text) from public, anon;
revoke execute on function public.visible_lesson_dates_json() from public, anon;
grant execute on function public.course_grade_inputs(text) to authenticated;
grant execute on function public.course_private_counts(text) to authenticated;
grant execute on function public.visible_lesson_dates_json() to authenticated;
commit;
