import JSZip from "jszip";

export type DiscordInputFile = {
  name: string;
  text: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

export type DiscordMessage = {
  id?: string;
  author?: string;
  content: string;
  timestamp?: string;
  channelName?: string;
  source: string;
  attachments?: string[];
};

export type DiscordParseResult = {
  messages: DiscordMessage[];
  filesRead: number;
  sources: string[];
  warnings: string[];
};

type UnknownRecord = Record<string, unknown>;

const MESSAGE_FILE_PATTERN = /\.(json|csv|txt)$/i;
const ZIP_PATTERN = /\.zip$/i;
const OFFICIAL_DISCORD_MESSAGE_PATTERN = /^Messages\/c[^/]+\/messages\.json$/i;
const MAX_TEXT_FILE_BYTES = 32 * 1024 * 1024;

export async function parseDiscordFiles(
  files: DiscordInputFile[],
): Promise<DiscordParseResult> {
  const result: DiscordParseResult = {
    messages: [],
    filesRead: 0,
    sources: [],
    warnings: [],
  };

  for (const file of files) {
    if (ZIP_PATTERN.test(file.name)) {
      await parseZipFile(file, result);
      continue;
    }

    if (!MESSAGE_FILE_PATTERN.test(file.name)) {
      result.warnings.push(`Skipped unsupported file: ${file.name}`);
      continue;
    }

    const text = await file.text();
    mergeParseResult(result, parseTextFile(file.name, text));
  }

  result.messages.sort((a, b) => {
    const left = a.timestamp ? Date.parse(a.timestamp) : 0;
    const right = b.timestamp ? Date.parse(b.timestamp) : 0;
    return left - right;
  });

  return result;
}

export function parseTextFile(name: string, text: string): DiscordParseResult {
  const result: DiscordParseResult = {
    messages: [],
    filesRead: 1,
    sources: [name],
    warnings: [],
  };

  const trimmed = text.trim();
  if (!trimmed) {
    result.warnings.push(`${name} was empty`);
    return result;
  }

  try {
    if (/\.json$/i.test(name)) {
      result.messages.push(...parseJsonMessages(name, trimmed));
    } else if (/\.csv$/i.test(name)) {
      result.messages.push(...parseCsvMessages(name, trimmed));
    } else {
      result.messages.push(...parsePlainTextMessages(name, trimmed));
    }
  } catch (error) {
    result.warnings.push(
      `${name} could not be parsed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  if (result.messages.length === 0) {
    result.warnings.push(`${name} did not contain readable messages`);
  }

  return result;
}

function mergeParseResult(target: DiscordParseResult, next: DiscordParseResult) {
  target.messages.push(...next.messages);
  target.filesRead += next.filesRead;
  target.sources.push(...next.sources);
  target.warnings.push(...next.warnings);
}

async function parseZipFile(file: DiscordInputFile, result: DiscordParseResult) {
  if (!file.arrayBuffer) {
    result.warnings.push(`${file.name} could not be read as a zip`);
    return;
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const readableEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && MESSAGE_FILE_PATTERN.test(entry.name),
  );
  const officialMessageEntries = readableEntries.filter((entry) =>
    OFFICIAL_DISCORD_MESSAGE_PATTERN.test(entry.name),
  );
  const entries =
    officialMessageEntries.length > 0 ? officialMessageEntries : readableEntries;

  if (entries.length === 0) {
    result.warnings.push(`${file.name} did not include JSON, CSV, or TXT files`);
    return;
  }

  for (const entry of entries) {
    const uncompressedSize = (
      entry as unknown as { _data?: { uncompressedSize?: number } }
    )._data?.uncompressedSize;
    if (uncompressedSize !== undefined && uncompressedSize > MAX_TEXT_FILE_BYTES) {
      result.warnings.push(`${entry.name} was skipped because it is too large`);
      continue;
    }

    const text = await entry.async("string");
    mergeParseResult(result, parseTextFile(entry.name, text));
  }
}

function parseJsonMessages(source: string, text: string): DiscordMessage[] {
  const parsed = JSON.parse(text) as unknown;
  const channelName = channelNameFromPath(source);
  const records = extractJsonMessageRecords(parsed);

  return records
    .map((record) => normalizeRecord(record, source, channelName))
    .filter((message): message is DiscordMessage => Boolean(message));
}

function extractJsonMessageRecords(parsed: unknown): UnknownRecord[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord);
  }

  if (!isRecord(parsed)) {
    return [];
  }

  const possibleArrays = [
    parsed.messages,
    parsed.Messages,
    parsed.data,
    parsed.items,
  ];

  for (const value of possibleArrays) {
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  if (hasMessageContent(parsed)) {
    return [parsed];
  }

  return [];
}

function parseCsvMessages(source: string, text: string): DiscordMessage[] {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return [];
  }

  const [header, ...dataRows] = rows;
  const channelName = channelNameFromPath(source);

  return dataRows
    .map((row) => {
      const record: UnknownRecord = {};
      header.forEach((key, index) => {
        record[key] = row[index] ?? "";
      });
      return normalizeRecord(record, source, channelName);
    })
    .filter((message): message is DiscordMessage => Boolean(message));
}

function parsePlainTextMessages(source: string, text: string): DiscordMessage[] {
  const channelName = channelNameFromPath(source);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line, index) => {
      const bracketed = line.match(/^\[([^\]]+)\]\s*([^:]+):\s*(.+)$/);
      const simple = line.match(/^([^:]{1,64}):\s*(.+)$/);

      if (!bracketed && !simple) {
        return {
          id: `${source}:${index}`,
          content: line,
          channelName,
          source,
        };
      }

      return {
        id: `${source}:${index}`,
        author: (bracketed?.[2] ?? simple?.[1])?.trim(),
        content: (bracketed?.[3] ?? simple?.[2] ?? "").trim(),
        timestamp: bracketed?.[1]?.trim(),
        channelName,
        source,
      };
    })
    .filter((message) => message.content.length > 0);
}

function normalizeRecord(
  record: UnknownRecord,
  source: string,
  channelName: string | undefined,
): DiscordMessage | undefined {
  const content = firstString(record, [
    "content",
    "contents",
    "Content",
    "Contents",
    "message",
    "Message",
    "text",
    "Text",
  ]);

  if (!content?.trim()) {
    return undefined;
  }

  const authorValue = getCaseInsensitive(record, "author");
  const author =
    authorFromValue(authorValue) ??
    firstString(record, [
      "authorName",
      "author_name",
      "Author",
      "Username",
      "username",
      "user",
      "User",
    ]);

  const timestamp = firstString(record, [
    "timestamp",
    "Timestamp",
    "date",
    "Date",
    "createdAt",
    "created_at",
  ]);

  const attachments = normalizeAttachments(
    getCaseInsensitive(record, "attachments") ?? getCaseInsensitive(record, "Attachments"),
  );

  return {
    id: firstString(record, ["id", "ID", "messageId", "message_id"]),
    author: author?.trim() || undefined,
    content: content.trim(),
    timestamp: timestamp?.trim() || undefined,
    channelName:
      firstString(record, ["channelName", "channel_name", "Channel", "channel"]) ??
      channelName,
    source,
    attachments,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row.map((value) => value.trim()));
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row.map((value) => value.trim()));

  return rows.filter((currentRow) => currentRow.some((value) => value.length > 0));
}

function firstString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = getCaseInsensitive(record, key);
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
}

function getCaseInsensitive(record: UnknownRecord, key: string) {
  const target = key.toLowerCase();
  const found = Object.keys(record).find((candidate) => candidate.toLowerCase() === target);
  return found ? record[found] : undefined;
}

function authorFromValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return firstString(value, [
    "global_name",
    "globalName",
    "username",
    "name",
    "displayName",
    "id",
  ]);
}

function normalizeAttachments(value: unknown): string[] | undefined {
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\s*,\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    const attachments = value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (isRecord(item)) {
          return firstString(item, ["url", "filename", "name", "id"]);
        }
        return undefined;
      })
      .filter((item): item is string => Boolean(item));
    return attachments.length > 0 ? attachments : undefined;
  }

  return undefined;
}

function channelNameFromPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length < 2) {
    return undefined;
  }

  const folder = parts[parts.length - 2];
  return folder.replace(/^\d+_?/, "").replace(/[-_]+/g, " ") || undefined;
}

function hasMessageContent(record: UnknownRecord) {
  return Boolean(firstString(record, ["content", "contents", "message", "text"]));
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
