import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseDiscordFiles, parseTextFile } from "./parser";

describe("Discord parser", () => {
  it("normalizes JSON message exports", () => {
    const result = parseTextFile(
      "messages/123_general/messages.json",
      JSON.stringify({
        messages: [
          {
            id: "1",
            timestamp: "2026-01-01T10:00:00.000Z",
            content: "that deploy was weirdly smooth",
            author: { username: "max" },
          },
        ],
      }),
    );

    expect(result.messages).toEqual([
      expect.objectContaining({
        id: "1",
        author: "max",
        channelName: "general",
        content: "that deploy was weirdly smooth",
      }),
    ]);
  });

  it("normalizes Discord CSV exports", () => {
    const result = parseTextFile(
      "messages/42/messages.csv",
      'ID,Timestamp,Contents,Attachments\n9,2026-02-02,"quoted, with comma",file.png',
    );

    expect(result.messages).toEqual([
      expect.objectContaining({
        id: "9",
        content: "quoted, with comma",
        attachments: ["file.png"],
      }),
    ]);
  });

  it("parses plain text logs", () => {
    const result = parseTextFile(
      "logs.txt",
      "[2026-03-03 10:00] max: shipping this tonight\nno-prefix fallback",
    );

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual(
      expect.objectContaining({
        author: "max",
        content: "shipping this tonight",
      }),
    );
    expect(result.messages[1]).toEqual(
      expect.objectContaining({
        content: "no-prefix fallback",
      }),
    );
  });

  it("reads supported files from a zip", async () => {
    const zip = new JSZip();
    zip.file(
      "messages/1_dev/messages.json",
      JSON.stringify([{ id: "1", author: "max", content: "zip works" }]),
    );
    zip.file("ignored.png", "not a message");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const result = await parseDiscordFiles([
      {
        name: "discord-package.zip",
        text: async () => "",
        arrayBuffer: async () => buffer,
      },
    ]);

    expect(result.messages).toEqual([
      expect.objectContaining({
        content: "zip works",
        channelName: "dev",
      }),
    ]);
  });

  it("prefers official Discord message exports over package metadata", async () => {
    const zip = new JSZip();
    zip.file(
      "Messages/c123/messages.json",
      JSON.stringify([
        {
          ID: "1",
          Timestamp: "2026-01-01T10:00:00.000Z",
          Contents: "this is the actual discord message",
          Attachments: "",
        },
      ]),
    );
    zip.file(
      "Messages/c123/channel.json",
      JSON.stringify({ id: "123", name: "metadata", type: 1 }),
    );
    zip.file(
      "README.txt",
      "- Account: Contains your avatar and some additional account information",
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const result = await parseDiscordFiles([
      {
        name: "discord-package.zip",
        text: async () => "",
        arrayBuffer: async () => buffer,
      },
    ]);

    expect(result.filesRead).toBe(1);
    expect(result.sources).toEqual(["Messages/c123/messages.json"]);
    expect(result.messages).toEqual([
      expect.objectContaining({
        id: "1",
        content: "this is the actual discord message",
        source: "Messages/c123/messages.json",
      }),
    ]);
  });

  it("reads official Discord message files larger than 8 MB", async () => {
    const zip = new JSZip();
    zip.file(
      "Messages/c999/messages.json",
      JSON.stringify([
        {
          ID: "large",
          Timestamp: "2026-01-01T10:00:00.000Z",
          Contents: "x".repeat(8 * 1024 * 1024 + 1),
          Attachments: "",
        },
      ]),
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const result = await parseDiscordFiles([
      {
        name: "discord-package.zip",
        text: async () => "",
        arrayBuffer: async () => buffer,
      },
    ]);

    expect(result.warnings).toEqual([]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual(
      expect.objectContaining({
        id: "large",
        source: "Messages/c999/messages.json",
      }),
    );
  });
});
