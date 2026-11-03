import { describe, expect, it } from "vitest";
import { missingHelpersTable, openHelpAsks } from "./task-helpers";
import type { Task, TaskHelper } from "./types";

function task(id: string, status: Task["status"] = "in_progress"): Task {
  return {
    id,
    space_id: "s",
    title: id,
    description: null,
    status,
    assignee_id: "b",
    created_by: "a",
    due_date: null,
    created_at: "2026-11-01T06:00:00.000Z",
  };
}

function helper(taskId: string, userId: string, status: TaskHelper["status"], createdAt: string): TaskHelper {
  return {
    task_id: taskId,
    user_id: userId,
    added_by: "a",
    comment_id: null,
    ask: "@C can you check this?",
    status,
    created_at: createdAt,
    done_at: null,
  };
}

describe("openHelpAsks", () => {
  const tasks = [task("t1"), task("t2"), task("t3", "done"), task("t4", "cancelled")];
  const helpers = [
    helper("t1", "c", "open", "2026-11-02T06:00:00.000Z"),
    helper("t2", "c", "open", "2026-11-03T06:00:00.000Z"),
    helper("t2", "d", "open", "2026-11-03T07:00:00.000Z"),
    helper("t3", "c", "open", "2026-11-03T08:00:00.000Z"),
    helper("t4", "c", "open", "2026-11-03T09:00:00.000Z"),
    helper("t5", "c", "open", "2026-11-03T10:00:00.000Z"),
  ];

  it("lists my open asks on live tasks, newest first", () => {
    expect(openHelpAsks(helpers, tasks, "c").map((row) => row.task.id)).toEqual(["t2", "t1"]);
  });

  it("drops parts already marked done", () => {
    const done = [helper("t1", "c", "done", "2026-11-02T06:00:00.000Z")];
    expect(openHelpAsks(done, tasks, "c")).toEqual([]);
  });
});

describe("missingHelpersTable", () => {
  it("spots the missing table or function", () => {
    expect(missingHelpersTable("Could not find the table 'public.task_helpers' in the schema cache")).toBe(true);
    expect(missingHelpersTable('relation "public.task_helpers" does not exist')).toBe(true);
    expect(missingHelpersTable("Could not find the function public.set_task_help_done(p_done, p_task_id) in the schema cache")).toBe(true);
  });

  it("ignores other errors", () => {
    expect(missingHelpersTable("new row violates row-level security policy")).toBe(false);
  });
});
