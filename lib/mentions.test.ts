import { describe, expect, it } from "vitest";
import { applyMention, EVERYONE, mentionMatches, mentionQueryAt, splitMentions } from "./mentions";

const people = [
  { id: "1", full_name: "Kartik Dhyani", email: "k@admexo.com" },
  { id: "2", full_name: "Gaurav Mishra", email: "g@admexo.com" },
];

describe("mentionQueryAt", () => {
  it("opens on a lone @ and keeps typing everyone", () => {
    expect(mentionQueryAt("Hi @", 4)).toEqual({ start: 3, query: "" });
    expect(mentionQueryAt("Hi @every", 9)?.query).toBe("every");
  });
});

describe("mentionMatches", () => {
  it("puts everyone first when the query is empty or a prefix of everyone", () => {
    expect(mentionMatches("", people)[0]).toEqual(EVERYONE);
    expect(mentionMatches("every", people)[0]).toEqual(EVERYONE);
    expect(mentionMatches("kartik", people).map((p) => p.id)).toEqual(["1"]);
  });

  it("keeps Ryan Ritabrata in the list when the team is larger than eight", () => {
    const crowd = [
      ...people,
      { id: "admin", full_name: "Admin", email: "ryan@admexo.com", role: "admin" as const },
      { id: "3", full_name: "Abhishek Tiwari", email: "a@admexo.com" },
      { id: "4", full_name: "Ashok Rawat", email: "as@admexo.com" },
      { id: "5", full_name: "Yogesh Mishra", email: "y@admexo.com" },
      { id: "6", full_name: "Sneha Chadda", email: "s@admexo.com" },
      { id: "7", full_name: "Mudit Chauhan", email: "m@admexo.com" },
      { id: "8", full_name: "Gaurav Two", email: "g2@admexo.com" },
    ];
    const ids = mentionMatches("", crowd).map((p) => p.id);
    expect(ids).toContain("admin");
    expect(mentionMatches("ryan", crowd).map((p) => p.id)).toEqual(["admin"]);
  });
});

describe("applyMention and splitMentions", () => {
  it("inserts @everyone and paints it as a mention", () => {
    const next = applyMention("Hi @", 4, 3, "everyone");
    expect(next.text).toBe("Hi @everyone ");
    const parts = splitMentions(next.text, people);
    expect(parts.some((part) => part.mention && part.value.toLowerCase() === "@everyone")).toBe(true);
  });
});
