import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalOllamaProvider } from "./local-provider";
import type { PersonaProfile } from "@/lib/persona/profile";

const profile: PersonaProfile = {
  targetAuthor: "Uploaded user",
  messageCount: 2,
  sourceCount: 1,
  topTerms: ["ship", "parser"],
  channels: ["dev"],
  sampleMessages: ["shipping this tonight", "can you check the upload flow?"],
  styleSummary: "short, quick replies and mostly direct statements",
  stats: {
    averageCharacters: 36,
    questionRate: 0.1,
    exclamationRate: 0,
    lowercaseStartRate: 1,
  },
};

describe("LocalOllamaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls Ollama chat with persona instructions and chat turns", async () => {
    const fetchSpy = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          model: "gpt-oss:120b",
          message: {
            role: "assistant",
            content: "ship it, then clean up the parser",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new LocalOllamaProvider({
      baseUrl: "http://ollama.local:11434",
      model: "gpt-oss:120b",
    });
    const result = await provider.generate({
      profile,
      messages: [{ role: "user", content: "what next?" }],
    });

    expect(result).toEqual({
      content: "ship it, then clean up the parser",
      model: "gpt-oss:120b",
      provider: "local",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://ollama.local:11434/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const request = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(request.model).toBe("gpt-oss:120b");
    expect(request.stream).toBe(false);
    expect(request.messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Representative Discord messages"),
      }),
    );
    expect(request.messages.at(-1)).toEqual({ role: "user", content: "what next?" });
  });

  it("throws a useful error when Ollama returns an API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: "model not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const provider = new LocalOllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "missing-model",
    });

    await expect(
      provider.generate({
        profile,
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow("Ollama request failed: model not found");
  });
});
