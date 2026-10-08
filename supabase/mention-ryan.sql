-- Paste in the Supabase SQL editor. Safe to re-run.
-- @Ryan Ritabrata (or @Ryan) notifies the workspace owner even if the profile name is Admin.

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
    select id, full_name, email, role
    from public.profiles
    where id is distinct from p_actor_id
  loop
    if p.role = 'admin' or lower(coalesce(p.email, '')) = 'ryan@admexo.com' then
      if public.mention_hit(p_body, 'Ryan Ritabrata')
        or public.mention_hit(p_body, 'Ryan')
        or public.mention_hit(p_body, coalesce(p.full_name, '')) then
        perform public.push_notification(p.id, p_actor_id, p_type, p_title, p_body, p_href);
      end if;
      continue;
    end if;

    if coalesce(nullif(trim(p.full_name), ''), '') = '' then
      continue;
    end if;

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
