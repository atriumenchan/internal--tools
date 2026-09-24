import { describe, expect, it } from "vitest";
import { displayName, visibleSpaceTasks } from "./spaces";

const mine = { assignee_id: "me", created_by: "boss" };
const theirs = { assignee_id: "them", created_by: "me" };
const unassignedMine = { assignee_id: null, created_by: "me" };
const unassignedTheirs = { assignee_id: null, created_by: "them" };

describe("visibleSpaceTasks", () => {
  it("defaults to assigned-to-me plus my unassigned cards", () => {
    expect(visibleSpaceTasks([mine, theirs, unassignedMine, unassignedTheirs], "me", "me")).toEqual([
      mine,
      unassignedMine,
    ]);
  });

  it("can show one other person's cards", () => {
    expect(visibleSpaceTasks([mine, theirs, unassignedTheirs], "them", "me")).toEqual([theirs, unassignedTheirs]);
  });

  it("can show everyone", () => {
    expect(visibleSpaceTasks([mine, theirs], "all", "me")).toEqual([mine, theirs]);
  });
});

describe("displayName", () => {
  it("calls the workspace owner Ryan Ritabrata, not Admin", () => {
    expect(displayName({ full_name: "Admin", email: "ryan@admexo.com", role: "admin" })).toBe("Ryan Ritabrata");
    expect(displayName({ full_name: "Admin", email: "x@y.com", role: "employee" })).toBe("Ryan Ritabrata");
  });
});
