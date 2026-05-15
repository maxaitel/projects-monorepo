import type { DiscordMessage } from "@/lib/discord/parser";

export type PersonaStats = {
  averageCharacters: number;
  questionRate: number;
  exclamationRate: number;
  lowercaseStartRate: number;
};

export type PersonaProfile = {
  targetAuthor: string;
  messageCount: number;
  sourceCount: number;
  dateRange?: {
    start: string;
    end: string;
  };
  topTerms: string[];
  channels: string[];
  sampleMessages: string[];
  styleSummary: string;
  stats: PersonaStats;
};

export type PersonaAuthorSummary = {
  name: string;
  count: number;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "but",
  "can",
  "cant",
  "could",
  "did",
  "does",
  "for",
  "from",
  "get",
  "had",
  "has",
  "have",
  "how",
  "just",
  "like",
  "not",
  "now",
  "that",
  "the",
  "then",
  "there",
  "they",
  "this",
  "was",
  "what",
  "when",
  "with",
  "you",
  "your",
]);

export function summarizeAuthors(messages: DiscordMessage[]): PersonaAuthorSummary[] {
  const counts = new Map<string, number>();

  for (const message of messages) {
    if (!message.author) {
      continue;
    }
    counts.set(message.author, (counts.get(message.author) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function buildPersonaProfile(
  messages: DiscordMessage[],
  targetAuthor?: string,
): PersonaProfile {
  const authors = summarizeAuthors(messages);
  const author = targetAuthor ?? authors[0]?.name ?? "Uploaded user";
  const authoredMessages = messages.filter((message) => {
    if (!targetAuthor && authors.length === 0) {
      return true;
    }
    return message.author === author;
  });
  const profileMessages = authoredMessages.length > 0 ? authoredMessages : messages;
  const textMessages = profileMessages
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);

  const stats = buildStats(textMessages);
  const topTerms = getTopTerms(textMessages, 12);
  const channels = getTopChannels(profileMessages, 8);
  const sampleMessages = pickSampleMessages(textMessages, 18);
  const dateRange = getDateRange(profileMessages);

  return {
    targetAuthor: author,
    messageCount: profileMessages.length,
    sourceCount: new Set(profileMessages.map((message) => message.source)).size,
    dateRange,
    topTerms,
    channels,
    sampleMessages,
    styleSummary: buildStyleSummary(stats, topTerms, sampleMessages),
    stats,
  };
}

function buildStats(messages: string[]): PersonaStats {
  if (messages.length === 0) {
    return {
      averageCharacters: 0,
      questionRate: 0,
      exclamationRate: 0,
      lowercaseStartRate: 0,
    };
  }

  const totalCharacters = messages.reduce((sum, message) => sum + message.length, 0);
  const questionCount = messages.filter((message) => message.includes("?")).length;
  const exclamationCount = messages.filter((message) => message.includes("!")).length;
  const lowercaseStartCount = messages.filter((message) => /^[a-z]/.test(message)).length;

  return {
    averageCharacters: Math.round(totalCharacters / messages.length),
    questionRate: roundRatio(questionCount / messages.length),
    exclamationRate: roundRatio(exclamationCount / messages.length),
    lowercaseStartRate: roundRatio(lowercaseStartCount / messages.length),
  };
}

function getTopTerms(messages: string[], limit: number) {
  const counts = new Map<string, number>();

  for (const message of messages) {
    for (const token of message.toLowerCase().match(/[a-z][a-z'_-]{2,}/g) ?? []) {
      const normalized = token.replace(/^'+|'+$/g, "");
      if (!normalized || STOP_WORDS.has(normalized) || /^https?$/.test(normalized)) {
        continue;
      }
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

function getTopChannels(messages: DiscordMessage[], limit: number) {
  const counts = new Map<string, number>();

  for (const message of messages) {
    if (!message.channelName) {
      continue;
    }
    counts.set(message.channelName, (counts.get(message.channelName) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([channel]) => channel);
}

function pickSampleMessages(messages: string[], limit: number) {
  const seen = new Set<string>();
  const filtered = messages
    .map((message) => message.replace(/\s+/g, " ").trim())
    .filter((message) => {
      if (message.length < 8 || message.length > 280) {
        return false;
      }
      if (/^https?:\/\//i.test(message)) {
        return false;
      }
      const key = message.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

  if (filtered.length <= limit) {
    return filtered;
  }

  const step = Math.max(1, Math.floor(filtered.length / limit));
  return filtered.filter((_, index) => index % step === 0).slice(0, limit);
}

function getDateRange(messages: DiscordMessage[]) {
  const timestamps = messages
    .map((message) => (message.timestamp ? Date.parse(message.timestamp) : Number.NaN))
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((a, b) => a - b);

  if (timestamps.length === 0) {
    return undefined;
  }

  return {
    start: new Date(timestamps[0]).toISOString(),
    end: new Date(timestamps[timestamps.length - 1]).toISOString(),
  };
}

function buildStyleSummary(
  stats: PersonaStats,
  topTerms: string[],
  samples: string[],
) {
  const sentenceLength =
    stats.averageCharacters < 45
      ? "short, quick replies"
      : stats.averageCharacters < 120
        ? "medium-length conversational replies"
        : "longer, detailed replies";
  const questionStyle =
    stats.questionRate > 0.25 ? "asks a lot of questions" : "mostly makes direct statements";
  const punctuation =
    stats.exclamationRate > 0.18
      ? "uses energetic punctuation"
      : "keeps punctuation fairly restrained";
  const casing =
    stats.lowercaseStartRate > 0.45
      ? "often starts casually in lowercase"
      : "usually uses sentence-style casing";
  const topics =
    topTerms.length > 0 ? `Recurring terms: ${topTerms.slice(0, 8).join(", ")}.` : "";
  const sampleHint =
    samples.length > 0
      ? `Representative line: "${samples[0].slice(0, 160)}${samples[0].length > 160 ? "..." : ""}"`
      : "";

  return [sentenceLength, questionStyle, punctuation, casing, topics, sampleHint]
    .filter(Boolean)
    .join(" ");
}

function roundRatio(value: number) {
  return Math.round(value * 100) / 100;
}
