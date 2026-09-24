-- Paste in the Supabase SQL editor. Safe to re-run.
-- Group and board chat icons, plus add/remove members and rename from Chat.

alter table public.conversations
  add column if not exists icon text;

alter table public.spaces
  add column if not exists icon text;

comment on column public.conversations.icon is 'Lucide icon name used as the chat favicon.';
comment on column public.spaces.icon is 'Lucide icon name, kept in sync with the board chat channel.';

create or replace function public.update_chat_look(
  p_conversation_id uuid,
  p_name text,
  p_icon text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.conversation_type;
  v_space uuid;
  v_name text;
  v_icon text;
begin
  if not public.has_signed_handbook() then
    raise exception 'Handbook acknowledgement required';
  end if;
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'Not a member of this chat';
  end if;

  select type, space_id, name, icon
    into v_type, v_space, v_name, v_icon
  from public.conversations
  where id = p_conversation_id;

  if v_type is null then
    raise exception 'Chat not found';
  end if;
  if v_type = 'dm' then
    raise exception 'Direct chats keep the other person’s name';
  end if;

  if p_name is not null then
    if length(trim(p_name)) < 1 then
      raise exception 'Name is required';
    end if;
    if v_type = 'space' then
      if v_space is null or not exists (
        select 1 from public.spaces
        where id = v_space
          and (created_by = auth.uid() or public.is_manager())
      ) then
        raise exception 'Only the person who created this board, or a manager, can rename it';
      end if;
    end if;
    v_name := trim(p_name);
  end if;

  if p_icon is not null then
    if length(trim(p_icon)) = 0 then
      v_icon := null;
    elsif trim(p_icon) !~ '^[A-Za-z][A-Za-z0-9]{1,63}$' then
      raise exception 'Pick an icon from the list';
    else
      v_icon := trim(p_icon);
    end if;
  end if;

  update public.conversations
  set name = v_name, icon = v_icon
  where id = p_conversation_id;

  if v_type = 'space' and v_space is not null then
    update public.spaces
    set name = v_name, icon = v_icon
    where id = v_space;
  end if;

  return jsonb_build_object('ok', true, 'name', v_name, 'icon', v_icon);
end;
$$;

create or replace function public.add_chat_members(p_conversation_id uuid, p_member_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.conversation_type;
  v_space uuid;
  v_uid uuid;
  v_added int := 0;
begin
  if not public.has_signed_handbook() then
    raise exception 'Handbook acknowledgement required';
  end if;
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'Not a member of this chat';
  end if;

  select type, space_id into v_type, v_space
  from public.conversations
  where id = p_conversation_id;

  if v_type is null or v_type = 'dm' then
    raise exception 'Pick a group or board chat';
  end if;

  if p_member_ids is not null then
    foreach v_uid in array p_member_ids
    loop
      if v_uid is null then
        continue;
      end if;
      if not exists (select 1 from public.profiles where id = v_uid) then
        continue;
      end if;
      if v_type = 'space' and v_space is not null then
        insert into public.space_members (space_id, user_id)
        values (v_space, v_uid)
        on conflict do nothing;
      end if;
      insert into public.conversation_members (conversation_id, user_id)
      values (p_conversation_id, v_uid)
      on conflict do nothing;
      v_added := v_added + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_chat_member(p_conversation_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.conversation_type;
  v_space uuid;
  v_owner uuid;
begin
  if not public.has_signed_handbook() then
    raise exception 'Handbook acknowledgement required';
  end if;
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'Not a member of this chat';
  end if;
  if p_user_id is null then
    raise exception 'Person is required';
  end if;

  select type, space_id into v_type, v_space
  from public.conversations
  where id = p_conversation_id;

  if v_type is null or v_type = 'dm' then
    raise exception 'Pick a group or board chat';
  end if;

  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id
  ) then
    raise exception 'That person is not in this chat';
  end if;

  if v_type = 'space' then
    if v_space is null or not exists (
      select 1 from public.spaces
      where id = v_space
        and (created_by = auth.uid() or public.is_manager())
    ) then
      raise exception 'Only the person who created this board, or a manager, can remove someone';
    end if;
    select created_by into v_owner from public.spaces where id = v_space;
    if v_owner is not distinct from p_user_id then
      raise exception 'The person who created this board cannot be removed';
    end if;
    delete from public.space_members
    where space_id = v_space and user_id = p_user_id;
  elsif p_user_id = auth.uid() then
    if (
      select count(*) from public.conversation_members
      where conversation_id = p_conversation_id
    ) <= 1 then
      raise exception 'Add someone else before leaving, or delete the group';
    end if;
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.update_chat_look(uuid, text, text) to authenticated;
grant execute on function public.add_chat_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_chat_member(uuid, uuid) to authenticated;
revoke all on function public.update_chat_look(uuid, text, text) from public, anon;
revoke all on function public.add_chat_members(uuid, uuid[]) from public, anon;
revoke all on function public.remove_chat_member(uuid, uuid) from public, anon;
