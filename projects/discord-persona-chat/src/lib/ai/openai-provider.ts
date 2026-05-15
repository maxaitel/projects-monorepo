import OpenAI from "openai";
import { createPersonaInstructions } from "./prompt";
import type { ChatProvider, GenerateChatInput, GenerateChatResult } from "./types";

const DEFAULT_MODEL = "gpt-5.4-mini";

export class OpenAIChatProvider implements ChatProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    this.client = new OpenAI({ apiKey });
    this.model = options?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  }

  async generate(input: GenerateChatInput): Promise<GenerateChatResult> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: createPersonaInstructions(input.profile),
      input: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      max_output_tokens: 700,
    });

    return {
      content: response.output_text?.trim() || "I could not generate a reply.",
      model: this.model,
      provider: "openai",
    };
  }
}
