-- Paste in the Supabase SQL editor. Safe to re-run.
-- 1. @everyone in chat and task comments notifies the whole list (except the writer).
-- 2. Creates a Reports board and puts every login on it, including people who join later.

create or replace function public.notify_mentions(
  p_actor_id uuid,
  p_body text,
  p_type text,
  p_title text,
  p_href text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_first text;
  v_first_count int;
begin
  if p_body is null or position('@' in p_body) = 0 then
    return;
  end if;

  if public.mention_hit(p_body, 'everyone') then
    for p in
      select id from public.profiles where id is distinct from p_actor_id
    loop
      perform public.push_notification(p.id, p_actor_id, p_type, p_title, p_body, p_href);
    end loop;
    return;
  end if;

  for p in
    select id, full_name
    from public.profiles
    where id is distinct from p_actor_id
      and coalesce(nullif(trim(full_name), ''), '') <> ''
  loop
    if public.mention_hit(p_body, p.full_name) then
      perform public.push_notification(p.id, p_actor_id, p_type, p_title, p_body, p_href);
      continue;
    end if;

    v_first := split_part(trim(p.full_name), ' ', 1);
    if length(v_first) < 2 then
      continue;
    end if;
    select count(*) into v_first_count
    from public.profiles
    where lower(split_part(trim(full_name), ' ', 1)) = lower(v_first);
    if v_first_count = 1 and public.mention_hit(p_body, v_first) then
      perform public.push_notification(p.id, p_actor_id, p_type, p_title, p_body, p_href);
    end if;
  end loop;
end;
$$;

create or replace function public.ensure_reports_space()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_conv uuid;
  v_owner uuid;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.has_signed_handbook() and not public.is_admin() then
    raise exception 'Handbook acknowledgement required';
  end if;

  select id, created_by into v_id, v_owner
  from public.spaces
  where lower(trim(name)) = 'reports'
  order by created_at
  limit 1;

  if v_id is null then
    insert into public.spaces (name, color, created_by)
    values ('Reports', '#0c7e71', auth.uid())
    returning id into v_id;

    insert into public.conversations (type, space_id, name)
    values ('space', v_id, 'Reports')
    returning id into v_conv;
  else
    select id into v_conv from public.conversations where type = 'space' and space_id = v_id limit 1;
    if v_conv is null then
      insert into public.conversations (type, space_id, name)
      values ('space', v_id, 'Reports')
      returning id into v_conv;
    end if;
  end if;

  for r in select id from public.profiles
  loop
    insert into public.space_members (space_id, user_id)
    values (v_id, r.id)
    on conflict do nothing;
    if v_conv is not null then
      insert into public.conversation_members (conversation_id, user_id)
      values (v_conv, r.id)
      on conflict do nothing;
    end if;
  end loop;

  return v_id;
end;
$$;

grant execute on function public.ensure_reports_space() to authenticated;

create or replace function public.add_profile_to_default_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_conv_id uuid;
  v_name text;
begin
  foreach v_name in array array['admexo', 'reports']
  loop
    select id into v_space_id from public.spaces where lower(trim(name)) = v_name order by created_at limit 1;
    if v_space_id is null then
      continue;
    end if;
    insert into public.space_members (space_id, user_id)
    values (v_space_id, new.id)
    on conflict do nothing;
    select id into v_conv_id from public.conversations
    where type = 'space' and space_id = v_space_id
    limit 1;
    if v_conv_id is not null then
      insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, new.id)
      on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;
