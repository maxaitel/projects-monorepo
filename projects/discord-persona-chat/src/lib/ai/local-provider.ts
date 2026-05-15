import { createPersonaInstructions } from "./prompt";
import type { ChatProvider, GenerateChatInput, GenerateChatResult } from "./types";

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "gpt-oss:120b";

type OllamaChatResponse = {
  model?: string;
  message?: {
    role?: string;
    content?: string;
  };
  error?: string;
};

export class LocalOllamaProvider implements ChatProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(options?: { baseUrl?: string; model?: string }) {
    this.baseUrl = stripTrailingSlash(
      options?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    );
    this.model = options?.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
  }

  async generate(input: GenerateChatInput): Promise<GenerateChatResult> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          {
            role: "system",
            content: createPersonaInstructions(input.profile),
          },
          ...input.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        options: {
          temperature: 0.8,
          top_p: 0.9,
          num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 8192),
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OllamaChatResponse;

    if (!response.ok || payload.error) {
      throw new Error(
        `Ollama request failed: ${payload.error ?? `${response.status} ${response.statusText}`}`,
      );
    }

    const content = payload.message?.content?.trim();

    return {
      content: content || "Ollama returned an empty reply.",
      model: payload.model ?? this.model,
      provider: "local",
    };
  }
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
