import type { PersonaProfile } from "@/lib/persona/profile";

export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

export type GenerateChatInput = {
  profile: PersonaProfile;
  messages: ChatTurn[];
};

export type GenerateChatResult = {
  content: string;
  model: string;
  provider: "openai" | "local";
};

export interface ChatProvider {
  generate(input: GenerateChatInput): Promise<GenerateChatResult>;
}
