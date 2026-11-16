import { describe, expect, it } from "vitest";
import { balanceHeadline, balanceProviderKey, balanceStatus, classifyCredit, seesApiBalances } from "./api-balances";
import { readDeepseekBalance, readFalBalance } from "./provider-balances";

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

  it("reads a live DeepSeek and fal balance", () => {
    expect(classifyCredit(0)).toBe("depleted");
    expect(classifyCredit(2)).toBe("low");
    expect(classifyCredit(40)).toBe("ok");
    expect(
      readDeepseekBalance({
        is_available: true,
        balance_infos: [{ currency: "CNY", total_balance: "8.66" }],
      }).balance
    ).toBe("CNY 8.66");
    expect(readFalBalance({ credits: { current_balance: 0, currency: "USD" } }).status).toBe("depleted");
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
