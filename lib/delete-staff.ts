import type { SupabaseClient } from "@supabase/supabase-js";

type TaskRow = {
  id: string;
  space_id: string;
  title: string;
  description: string | null;
  status: string;
  assignee_id: string | null;
  created_by: string;
  due_date: string | null;
  priority: string | null;
  completion_criteria: string | null;
  reviewer_id: string | null;
  created_at: string;
};

async function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Move boards/tasks off a login so Auth can delete the user. */
export async function rehomeStaffWork(admin: SupabaseClient, fromId: string, toId: string) {
  await throwIf((await admin.from("employees").update({ user_id: null }).eq("user_id", fromId)).error);
  await throwIf((await admin.from("spaces").update({ created_by: toId }).eq("created_by", fromId)).error);

  const { data: owned, error: ownedErr } = await admin.from("tasks").select("*").eq("created_by", fromId);
  await throwIf(ownedErr);
  const tasks = (owned ?? []) as TaskRow[];

  if (tasks.length) {
    const upd = await admin.from("tasks").update({ created_by: toId }).eq("created_by", fromId);
    const { data: leftover, error: leftErr } = upd.error
      ? { data: tasks, error: null }
      : await admin.from("tasks").select("id").eq("created_by", fromId);
    await throwIf(leftErr);

    if ((leftover ?? []).length) {
      const ids = tasks.map((t) => t.id);
      const { data: comments, error: cErr } = await admin.from("task_comments").select("*").in("task_id", ids);
      await throwIf(cErr);
      const { data: files, error: fErr } = await admin.from("task_files").select("*").in("task_id", ids);
      await throwIf(fErr);

      await throwIf((await admin.from("task_files").delete().in("task_id", ids)).error);
      await throwIf((await admin.from("task_comments").delete().in("task_id", ids)).error);
      await throwIf((await admin.from("tasks").delete().in("id", ids)).error);

      const rewritten = tasks.map((t) => ({
        id: t.id,
        space_id: t.space_id,
        title: t.title,
        description: t.description,
        status: t.status,
        assignee_id: t.assignee_id === fromId ? null : t.assignee_id,
        created_by: toId,
        due_date: t.due_date,
        priority: t.priority ?? "medium",
        completion_criteria: t.completion_criteria,
        reviewer_id: t.reviewer_id === fromId ? null : t.reviewer_id,
        created_at: t.created_at,
      }));
      await throwIf((await admin.from("tasks").insert(rewritten)).error);
      if (comments?.length) await throwIf((await admin.from("task_comments").insert(comments)).error);
      if (files?.length) {
        const restored = files.map((file) => ({
          ...file,
          uploaded_by: file.uploaded_by === fromId ? toId : file.uploaded_by,
        }));
        await throwIf((await admin.from("task_files").insert(restored)).error);
      }
    }
  }

  await throwIf((await admin.from("tasks").update({ assignee_id: null }).eq("assignee_id", fromId)).error);
  await admin.from("tasks").update({ reviewer_id: null }).eq("reviewer_id", fromId);
}
