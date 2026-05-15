import type { DiscordMessage } from "@/lib/discord/parser";
import type { PersonaProfile } from "./profile";

export type TrainingExample = {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
};

export function createTrainingExamples(
  profile: PersonaProfile,
  messages: DiscordMessage[],
  limit = 200,
): TrainingExample[] {
  return messages
    .filter((message) => message.author === profile.targetAuthor)
    .map((message) => message.content.replace(/\s+/g, " ").trim())
    .filter((content) => content.length >= 12 && content.length <= 600)
    .slice(0, limit)
    .map((content) => ({
      messages: [
        {
          role: "system",
          content:
            "Write in the user's Discord style. Preserve tone and cadence without claiming private facts unless they are provided in the prompt.",
        },
        {
          role: "user",
          content: "Reply naturally in the uploaded Discord style.",
        },
        {
          role: "assistant",
          content,
        },
      ],
    }));
}

export function createTrainingJsonl(
  profile: PersonaProfile,
  messages: DiscordMessage[],
  limit = 200,
) {
  return createTrainingExamples(profile, messages, limit)
    .map((example) => JSON.stringify(example))
    .join("\n");
}
