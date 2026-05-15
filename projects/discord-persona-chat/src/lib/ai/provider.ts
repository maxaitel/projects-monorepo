import { LocalOllamaProvider } from "./local-provider";
import { OpenAIChatProvider } from "./openai-provider";
import type { ChatProvider } from "./types";

export type ProviderName = "openai" | "local";

export function getChatProvider(provider: ProviderName = "openai"): ChatProvider {
  if (provider === "local") {
    return new LocalOllamaProvider();
  }

  return new OpenAIChatProvider();
}
