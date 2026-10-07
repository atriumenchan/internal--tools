import { describe, expect, it } from "vitest";
import { chatPreview, clusterMessages, dayLabel, isChatImage } from "./chat-thread";
import type { ChatMessage } from "./types";

function msg(partial: Partial<ChatMessage> & { id: string; created_at: string }): ChatMessage {
  return {
    conversation_id: "c",
    author_id: "a",
    body: "",
    ...partial,
  };
}

describe("isChatImage", () => {
  it("treats jpeg and png as photos", () => {
    expect(isChatImage("image/jpeg", "shot.jpg")).toBe(true);
    expect(isChatImage("application/pdf", "notes.pdf")).toBe(false);
    expect(isChatImage("", "deck.png")).toBe(true);
  });
});

describe("chatPreview", () => {
  it("prefers a caption, else Photo or the file name", () => {
    expect(chatPreview({ body: "look", file_name: "a.png", file_type: "image/png" })).toBe("look");
    expect(chatPreview({ body: "", file_name: "a.png", file_type: "image/png" })).toBe("Photo");
    expect(chatPreview({ body: "  ", file_name: "brief.pdf", file_type: "application/pdf" })).toBe("brief.pdf");
  });
});

describe("clusterMessages", () => {
  it("groups the same person within five minutes, and splits on a new day", () => {
    const rows = [
      msg({ id: "1", author_id: "a", body: "hi", created_at: "2026-10-07T11:00:00.000Z" }),
      msg({ id: "2", author_id: "a", body: "again", created_at: "2026-10-07T11:02:00.000Z" }),
      msg({ id: "3", author_id: "b", body: "yo", created_at: "2026-10-07T11:03:00.000Z" }),
      msg({ id: "4", author_id: "a", body: "next day", created_at: "2026-10-08T11:00:00.000Z" }),
    ];
    const clusters = clusterMessages(rows);
    expect(clusters).toHaveLength(3);
    expect(clusters[0].messages.map((m) => m.id)).toEqual(["1", "2"]);
    expect(clusters[1].authorId).toBe("b");
    expect(clusters[2].day).toBe("2026-10-08");
  });
});

describe("dayLabel", () => {
  it("says Today and Yesterday in IST date keys", () => {
    expect(dayLabel("2026-10-07T12:00:00.000Z", "2026-10-07")).toBe("Today");
    expect(dayLabel("2026-10-06T12:00:00.000Z", "2026-10-07")).toBe("Yesterday");
  });
});
