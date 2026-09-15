drop policy if exists "members delete tasks" on public.tasks;
create policy "members delete tasks"
  on public.tasks for delete to authenticated
  using (public.has_signed_handbook() and public.is_space_member(space_id));

drop policy if exists "members delete spaces" on public.spaces;
create policy "members delete spaces"
  on public.spaces for delete to authenticated
  using (public.has_signed_handbook() and public.is_space_member(id));

drop policy if exists "authors delete task comments" on public.task_comments;
create policy "authors delete task comments"
  on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

drop policy if exists "authors delete messages" on public.messages;
create policy "authors delete messages"
  on public.messages for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

drop policy if exists "members delete conversations" on public.conversations;
create policy "members delete conversations"
  on public.conversations for delete to authenticated
  using (public.has_signed_handbook() and public.is_conversation_member(id) and type <> 'space');

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'task_files'
  ) then
    execute 'drop policy if exists "members delete task files" on public.task_files';
    execute $p$
      create policy "members delete task files"
        on public.task_files for delete to authenticated
        using (
          public.has_signed_handbook()
          and public.is_space_member(public.task_space_id(task_id))
        )
    $p$;
  end if;
end $$;
