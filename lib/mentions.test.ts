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
});

describe("applyMention and splitMentions", () => {
  it("inserts @everyone and paints it as a mention", () => {
    const next = applyMention("Hi @", 4, 3, "everyone");
    expect(next.text).toBe("Hi @everyone ");
    const parts = splitMentions(next.text, people);
    expect(parts.some((part) => part.mention && part.value.toLowerCase() === "@everyone")).toBe(true);
  });
});
