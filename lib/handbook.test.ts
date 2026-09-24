import { describe, expect, it } from "vitest";
import { mustSignHandbook } from "./handbook";

describe("mustSignHandbook", () => {
  it("never asks Ryan to sign", () => {
    expect(
      mustSignHandbook({
        role: "admin",
        email: "ryan@admexo.com",
        handbookVersion: null,
        requiredVersion: "3.0",
      })
    ).toBe(false);
    expect(
      mustSignHandbook({
        role: "employee",
        email: "ryan@admexo.com",
        handbookVersion: null,
        requiredVersion: "3.0",
      })
    ).toBe(false);
  });

  it("asks staff when the version changed", () => {
    expect(
      mustSignHandbook({
        role: "employee",
        email: "a@x.com",
        handbookVersion: "2.0",
        requiredVersion: "3.0",
      })
    ).toBe(true);
  });
});
