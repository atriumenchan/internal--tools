import { describe, expect, it } from "vitest";
import { missingChatLook, normalizeChatIcon } from "./chat-icons";

describe("normalizeChatIcon", () => {
  it("keeps lucide names", () => {
    expect(normalizeChatIcon("UsersRound")).toBe("UsersRound");
    expect(normalizeChatIcon(" @icon ")).toBe(null);
    expect(normalizeChatIcon("")).toBe(null);
  });
});

describe("missingChatLook", () => {
  it("spots a missing SQL function", () => {
    expect(missingChatLook("Could not find the function public.update_chat_look")).toBe(true);
  });
});
