-- Paste in the Supabase SQL editor. Safe to re-run.
-- Board creator or a manager can rename the board and exclude a person.

create or replace function public.rename_space(p_space_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_signed_handbook() then
    raise exception 'Handbook acknowledgement required';
  end if;
  if not public.is_space_member(p_space_id) then
    raise exception 'Not a member of this Space';
  end if;
  if not exists (
    select 1 from public.spaces
    where id = p_space_id
      and (created_by = auth.uid() or public.is_manager())
  ) then
    raise exception 'Only the person who created this board, or a manager, can rename it';
  end if;
  if p_name is null or length(trim(p_name)) < 1 then
    raise exception 'Name is required';
  end if;

  update public.spaces
  set name = trim(p_name)
  where id = p_space_id;

  update public.conversations
  set name = trim(p_name)
  where type = 'space' and space_id = p_space_id;

  return jsonb_build_object('ok', true, 'name', trim(p_name));
end;
$$;

create or replace function public.remove_space_member(p_space_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
  v_owner uuid;
begin
  if not public.has_signed_handbook() then
    raise exception 'Handbook acknowledgement required';
  end if;
  if not public.is_space_member(p_space_id) then
    raise exception 'Not a member of this Space';
  end if;
  if not exists (
    select 1 from public.spaces
    where id = p_space_id
      and (created_by = auth.uid() or public.is_manager())
  ) then
    raise exception 'Only the person who created this board, or a manager, can exclude someone';
  end if;

  select created_by into v_owner from public.spaces where id = p_space_id;
  if v_owner is not distinct from p_user_id then
    raise exception 'The person who created this board cannot be excluded';
  end if;
  if not exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = p_user_id
  ) then
    raise exception 'That person is not on this board';
  end if;

  delete from public.space_members
  where space_id = p_space_id and user_id = p_user_id;

  select id into v_conv from public.conversations
  where type = 'space' and space_id = p_space_id
  limit 1;
  if v_conv is not null then
    delete from public.conversation_members
    where conversation_id = v_conv and user_id = p_user_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.rename_space(uuid, text) to authenticated;
grant execute on function public.remove_space_member(uuid, uuid) to authenticated;
revoke all on function public.rename_space(uuid, text) from public, anon;
revoke all on function public.remove_space_member(uuid, uuid) from public, anon;
