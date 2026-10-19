import { describe, expect, it } from "vitest";
import {
  applyMention,
  commentMentionsUser,
  EVERYONE,
  mentionHit,
  mentionMatches,
  mentionQueryAt,
  splitMentions,
  unrepliedTaskMentions,
} from "./mentions";

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

describe("mentionHit and commentMentionsUser", () => {
  it("needs a word edge around the @name", () => {
    expect(mentionHit("please see @Kartik Dhyani today", "Kartik Dhyani")).toBe(true);
    expect(mentionHit("mail kartik@admexo.com", "Kartik")).toBe(false);
  });

  it("treats @everyone and a unique first name as a tag", () => {
    expect(commentMentionsUser("looping @everyone", people[0], people)).toBe(true);
    expect(commentMentionsUser("need @Kartik on this", people[0], people)).toBe(true);
    expect(commentMentionsUser("need @Gaurav", people[0], people)).toBe(false);
  });
});

describe("unrepliedTaskMentions", () => {
  const me = people[0];
  const tasks = [{ id: "t1", space_id: "s1", title: "Fix payroll" }];

  it("keeps a tag until that person comments after it", () => {
    const tagged = {
      id: "c1",
      task_id: "t1",
      author_id: "2",
      body: "Can you check this @Kartik Dhyani",
      created_at: "2026-10-19T10:00:00.000Z",
    };
    expect(
      unrepliedTaskMentions({ comments: [tagged], myComments: [], me, people, tasks }).map((row) => row.commentId)
    ).toEqual(["c1"]);
    expect(
      unrepliedTaskMentions({
        comments: [tagged],
        myComments: [{ task_id: "t1", created_at: "2026-10-19T11:00:00.000Z" }],
        me,
        people,
        tasks,
      })
    ).toEqual([]);
  });

  it("shows a new tag after an older reply", () => {
    const tagged = {
      id: "c2",
      task_id: "t1",
      author_id: "2",
      body: "@Kartik ping",
      created_at: "2026-10-19T12:00:00.000Z",
    };
    const rows = unrepliedTaskMentions({
      comments: [tagged],
      myComments: [{ task_id: "t1", created_at: "2026-10-19T11:00:00.000Z" }],
      me,
      people,
      tasks,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].href).toContain("#comment-c2");
  });
});
