import { describe, expect, it } from "vitest";
import { buildPersonaProfile, summarizeAuthors } from "./profile";

const messages = [
  {
    author: "max",
    content: "shipping this tonight, the dashboard flow is finally clean",
    timestamp: "2026-01-01T10:00:00.000Z",
    channelName: "dev",
    source: "messages.json",
  },
  {
    author: "max",
    content: "can you check the parser? it feels a little brittle",
    timestamp: "2026-01-02T10:00:00.000Z",
    channelName: "dev",
    source: "messages.json",
  },
  {
    author: "sam",
    content: "looks good",
    timestamp: "2026-01-03T10:00:00.000Z",
    channelName: "general",
    source: "messages.json",
  },
];

describe("persona profile", () => {
  it("summarizes authors by message count", () => {
    expect(summarizeAuthors(messages)).toEqual([
      { name: "max", count: 2 },
      { name: "sam", count: 1 },
    ]);
  });

  it("builds a compact style profile for the target author", () => {
    const profile = buildPersonaProfile(messages, "max");

    expect(profile.targetAuthor).toBe("max");
    expect(profile.messageCount).toBe(2);
    expect(profile.channels).toEqual(["dev"]);
    expect(profile.topTerms).toContain("parser");
    expect(profile.dateRange).toEqual({
      start: "2026-01-01T10:00:00.000Z",
      end: "2026-01-02T10:00:00.000Z",
    });
    expect(profile.styleSummary).toContain("Recurring terms");
  });
});
