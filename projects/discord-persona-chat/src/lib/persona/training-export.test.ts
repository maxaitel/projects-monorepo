import { describe, expect, it } from "vitest";
import { createTrainingExamples, createTrainingJsonl } from "./training-export";
import type { PersonaProfile } from "./profile";

const profile: PersonaProfile = {
  targetAuthor: "max",
  messageCount: 1,
  sourceCount: 1,
  topTerms: ["shipping"],
  channels: ["dev"],
  sampleMessages: ["shipping this tonight"],
  styleSummary: "short replies",
  stats: {
    averageCharacters: 20,
    questionRate: 0,
    exclamationRate: 0,
    lowercaseStartRate: 1,
  },
};

describe("training export", () => {
  it("creates JSONL examples from target-author messages", () => {
    const examples = createTrainingExamples(profile, [
      { author: "max", content: "shipping this tonight", source: "a.json" },
      { author: "sam", content: "not this one", source: "a.json" },
    ]);

    expect(examples).toHaveLength(1);
    expect(examples[0].messages.at(-1)).toEqual({
      role: "assistant",
      content: "shipping this tonight",
    });

    const jsonl = createTrainingJsonl(profile, [
      { author: "max", content: "shipping this tonight", source: "a.json" },
    ]);

    expect(JSON.parse(jsonl).messages).toHaveLength(3);
  });
});
