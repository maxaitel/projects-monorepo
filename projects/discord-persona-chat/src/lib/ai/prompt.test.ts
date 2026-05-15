import { describe, expect, it } from "vitest";
import { createPersonaInstructions } from "./prompt";
import type { PersonaProfile } from "@/lib/persona/profile";

const profile: PersonaProfile = {
  targetAuthor: "max",
  messageCount: 12,
  sourceCount: 2,
  topTerms: ["ship", "parser"],
  channels: ["dev"],
  sampleMessages: ["shipping this tonight"],
  styleSummary: "short, direct replies",
  stats: {
    averageCharacters: 42,
    questionRate: 0.1,
    exclamationRate: 0,
    lowercaseStartRate: 0.8,
  },
};

describe("persona prompt", () => {
  it("includes persona details and safety boundaries", () => {
    const prompt = createPersonaInstructions(profile);

    expect(prompt).toContain("Target author: max");
    expect(prompt).toContain("shipping this tonight");
    expect(prompt).toContain("Do not invent private memories");
    expect(prompt).toContain("not as an exact clone");
  });
});
