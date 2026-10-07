import { describe, expect, it } from "vitest";
import { canPostAnnouncements, workspaceRole } from "./roles";

describe("workspaceRole", () => {
  it("maps admin email and role to admin", () => {
    expect(workspaceRole({ email: "ryan@admexo.com", role: "employee" })).toBe("admin");
    expect(workspaceRole({ email: "a@x.com", role: "admin" })).toBe("admin");
  });

  it("treats hr as manager so existing accounts keep people tools", () => {
    expect(workspaceRole({ email: "a@x.com", role: "hr" })).toBe("manager");
    expect(workspaceRole({ email: "a@x.com", role: "manager" })).toBe("manager");
  });

  it("defaults everyone else to employee", () => {
    expect(workspaceRole({ email: "a@x.com", role: "employee" })).toBe("employee");
    expect(workspaceRole({ email: "a@x.com", role: "intern" })).toBe("employee");
  });
});

describe("canPostAnnouncements", () => {
  it("lets managers and admins post, not employees", () => {
    expect(canPostAnnouncements({ email: "a@x.com", role: "manager" })).toBe(true);
    expect(canPostAnnouncements({ email: "a@x.com", role: "hr" })).toBe(true);
    expect(canPostAnnouncements({ email: "ryan@admexo.com", role: "employee" })).toBe(true);
    expect(canPostAnnouncements({ email: "a@x.com", role: "employee" })).toBe(false);
  });
});
