import { describe, expect, it } from "vitest";
import { balanceHeadline, balanceProviderKey, balanceStatus, seesApiBalances } from "./api-balances";

describe("balance reports", () => {
  it("keeps a stable key for a provider name", () => {
    expect(balanceProviderKey("  Fal.AI  ")).toBe("fal.ai");
    expect(balanceProviderKey("DeepSeek")).toBe("deepseek");
  });

  it("treats empty and ended as depleted", () => {
    expect(balanceStatus("depleted")).toBe("depleted");
    expect(balanceStatus("empty")).toBe("depleted");
    expect(balanceStatus("low")).toBe("low");
    expect(balanceStatus("ok")).toBe("ok");
    expect(balanceStatus("maybe")).toBeNull();
  });

  it("shows balances only to Gaurav Mishra", () => {
    expect(seesApiBalances({ full_name: "Gaurav Mishra", email: "g@admexo.com" })).toBe(true);
    expect(seesApiBalances({ full_name: "Ryan Ritabrata", email: "ryan@admexo.com" })).toBe(false);
  });

  it("writes a recharge headline only when the credit is gone", () => {
    expect(balanceHeadline("fal.ai", "depleted")).toBe("fal.ai needs a recharge");
    expect(balanceHeadline("DeepSeek", "low")).toBe("DeepSeek is running low");
  });
});
