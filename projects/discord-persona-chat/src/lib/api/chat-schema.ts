import type { PersonaProfile } from "@/lib/persona/profile";
import type { ChatTurn } from "@/lib/ai/types";

export type ChatRequestBody = {
  provider?: "openai" | "local";
  profile: PersonaProfile;
  messages: ChatTurn[];
};

export function parseChatRequestBody(value: unknown): ChatRequestBody {
  if (!isRecord(value)) {
    throw new Error("Request body must be an object.");
  }

  const provider = value.provider;
  if (provider !== undefined && provider !== "openai" && provider !== "local") {
    throw new Error("Provider must be openai or local.");
  }

  if (!isRecord(value.profile)) {
    throw new Error("Profile is required.");
  }

  const profile = value.profile as unknown as PersonaProfile;
  if (typeof profile.targetAuthor !== "string" || !profile.targetAuthor.trim()) {
    throw new Error("Profile target author is required.");
  }

  if (!Array.isArray(value.messages)) {
    throw new Error("Messages are required.");
  }

  const messages: ChatTurn[] = value.messages.map((message, index) => {
    if (!isRecord(message)) {
      throw new Error(`Message ${index + 1} must be an object.`);
    }
    const role = message.role;
    if (role !== "user" && role !== "assistant") {
      throw new Error(`Message ${index + 1} has an invalid role.`);
    }
    if (typeof message.content !== "string" || !message.content.trim()) {
      throw new Error(`Message ${index + 1} content is required.`);
    }
    return {
      role,
      content: message.content.slice(0, 4000),
    };
  });

  if (messages.length === 0) {
    throw new Error("At least one message is required.");
  }

  return {
    provider,
    profile,
    messages: messages.slice(-16),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
