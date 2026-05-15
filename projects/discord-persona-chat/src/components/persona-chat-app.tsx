"use client";

import {
  Bot,
  Download,
  FileArchive,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { parseDiscordFiles, type DiscordParseResult } from "@/lib/discord/parser";
import {
  buildPersonaProfile,
  summarizeAuthors,
  type PersonaProfile,
} from "@/lib/persona/profile";
import { createTrainingJsonl } from "@/lib/persona/training-export";
import type { ChatTurn } from "@/lib/ai/types";

type ProviderName = "openai" | "local";

type ChatStatus = "idle" | "parsing" | "ready" | "thinking" | "error";

const initialAssistantMessage: ChatTurn = {
  role: "assistant",
  content:
    "Upload Discord data, pick the author to model, then ask me something. I will use the style profile from the messages.",
};

export function PersonaChatApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseResult, setParseResult] = useState<DiscordParseResult | null>(null);
  const [profile, setProfile] = useState<PersonaProfile | null>(null);
  const [selectedAuthor, setSelectedAuthor] = useState("");
  const [provider, setProvider] = useState<ProviderName>("openai");
  const [messages, setMessages] = useState<ChatTurn[]>([initialAssistantMessage]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [notice, setNotice] = useState("");

  const authors = useMemo(
    () => (parseResult ? summarizeAuthors(parseResult.messages) : []),
    [parseResult],
  );

  const canChat = Boolean(profile && draft.trim() && status !== "thinking");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setStatus("parsing");
    setNotice("Reading Discord files locally...");

    try {
      const result = await parseDiscordFiles(Array.from(files));
      const authorSummaries = summarizeAuthors(result.messages);
      const nextAuthor = authorSummaries[0]?.name ?? "";
      const nextProfile = buildPersonaProfile(
        result.messages,
        nextAuthor || undefined,
      );

      setParseResult(result);
      setSelectedAuthor(nextAuthor);
      setProfile(nextProfile);
      setMessages([initialAssistantMessage]);
      setStatus("ready");
      setNotice(
        result.messages.length > 0
          ? `Profile built from ${result.messages.length.toLocaleString()} messages.`
          : "No readable messages found. Try a Discord data package, JSON, CSV, or text log.",
      );
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "Could not parse those files.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleAuthorChange(author: string) {
    setSelectedAuthor(author);
    if (!parseResult) {
      return;
    }
    setProfile(buildPersonaProfile(parseResult.messages, author || undefined));
    setMessages([initialAssistantMessage]);
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canChat || !profile) {
      return;
    }

    const userMessage: ChatTurn = { role: "user", content: draft.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setStatus("thinking");
    setNotice(provider === "openai" ? "Calling OpenAI..." : "Calling local Ollama...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          profile,
          messages: nextMessages.filter((message) => message.role !== "assistant" || message.content !== initialAssistantMessage.content),
        }),
      });
      const payload = (await response.json()) as { content?: string; error?: string; model?: string };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Chat request failed.");
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: payload.content ?? "No reply returned.",
        },
      ]);
      setStatus("ready");
      setNotice(payload.model ? `Reply generated with ${payload.model}.` : "Reply generated.");
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "Unable to generate a reply.");
      setMessages(nextMessages);
    }
  }

  function handleTrainingDownload() {
    if (!profile || !parseResult) {
      return;
    }

    const jsonl = createTrainingJsonl(profile, parseResult.messages, 400);
    const blob = new Blob([jsonl], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${profile.targetAuthor.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-discord-style.jsonl`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="grain min-h-screen px-4 py-4 text-[var(--foreground)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col gap-4">
        <header className="flex flex-col justify-between gap-4 border-b border-[var(--line)] pb-4 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-[var(--panel-strong)] text-white">
                <MessageCircle size={20} aria-hidden="true" />
              </div>
              <span className="font-mono text-sm text-[var(--muted)]">discord-persona-chat</span>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[0] sm:text-5xl lg:text-6xl">
              Upload Discord data. Talk to the style it leaves behind.
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] p-1">
            <button
              type="button"
              onClick={() => setProvider("openai")}
              className={`flex min-h-10 items-center gap-2 rounded px-4 text-sm font-medium transition ${
                provider === "openai"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-black/5"
              }`}
            >
              <Sparkles size={16} aria-hidden="true" />
              OpenAI
            </button>
            <button
              type="button"
              onClick={() => setProvider("local")}
              className={`flex min-h-10 items-center gap-2 rounded px-4 text-sm font-medium transition ${
                provider === "local"
                  ? "bg-[var(--panel-strong)] text-white"
                  : "text-[var(--muted)] hover:bg-black/5"
              }`}
            >
              <Bot size={16} aria-hidden="true" />
              Ollama
            </button>
          </div>
        </header>

        <section className="grid flex-1 gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4">
            <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Source data</h2>
                  <p className="text-sm text-[var(--muted)]">Zip, JSON, CSV, or text exports.</p>
                </div>
                <FileArchive className="text-[var(--accent)]" size={22} aria-hidden="true" />
              </div>

              <label
                htmlFor="discord-files"
                className="flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed border-[var(--line-strong)] bg-[#fbf7ef] px-4 text-center transition hover:border-[var(--accent)] hover:bg-white"
              >
                <input
                  ref={fileInputRef}
                  id="discord-files"
                  type="file"
                  multiple
                  accept=".zip,.json,.csv,.txt"
                  className="sr-only"
                  onChange={(event) => void handleFiles(event.target.files)}
                />
                {status === "parsing" ? (
                  <Loader2 className="mb-3 animate-spin text-[var(--accent)]" size={30} aria-hidden="true" />
                ) : (
                  <FileArchive className="mb-3 text-[var(--accent)]" size={30} aria-hidden="true" />
                )}
                <span className="text-base font-semibold">Choose Discord files</span>
                <span className="mt-2 max-w-64 text-sm leading-5 text-[var(--muted)]">
                  Official data packages usually include message JSON or CSV files.
                </span>
              </label>

              {notice ? (
                <p
                  className={`mt-3 rounded-md px-3 py-2 text-sm ${
                    status === "error"
                      ? "bg-[rgba(206,79,62,0.12)] text-[var(--coral)]"
                      : "bg-[rgba(21,107,95,0.10)] text-[var(--accent-strong)]"
                  }`}
                >
                  {notice}
                </p>
              ) : null}
            </div>

            <ProfilePanel
              authors={authors}
              selectedAuthor={selectedAuthor}
              profile={profile}
              parseResult={parseResult}
              onAuthorChange={handleAuthorChange}
              onTrainingDownload={handleTrainingDownload}
            />
          </aside>

          <section className="flex min-h-[620px] flex-col overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)] shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-[rgba(55,90,131,0.13)] text-[var(--blue)]">
                  <Bot size={18} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-semibold">Persona chat</h2>
                  <p className="text-xs text-[var(--muted)]">
                    {profile ? `${profile.targetAuthor} profile active` : "Waiting for an upload"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMessages([initialAssistantMessage])}
                className="flex size-10 items-center justify-center rounded-md border border-[var(--line)] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--foreground)]"
                aria-label="Reset chat"
                title="Reset chat"
              >
                <RefreshCw size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-[#fffcf6] px-4 py-5">
              {messages.map((message, index) => (
                <ChatBubble key={`${message.role}-${index}`} message={message} />
              ))}
            </div>

            <form onSubmit={handleSend} className="border-t border-[var(--line)] bg-[var(--panel)] p-3">
              <div className="flex gap-3">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={profile ? "Ask the persona something..." : "Upload Discord data to start chatting..."}
                  className="min-h-12 flex-1 resize-none rounded-md border border-[var(--line)] bg-white px-3 py-3 text-sm leading-5 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(21,107,95,0.12)]"
                  rows={1}
                  disabled={!profile || status === "thinking"}
                />
                <button
                  type="submit"
                  disabled={!canChat}
                  className="flex size-12 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-white transition hover:bg-[var(--accent-strong)] disabled:bg-[var(--line-strong)]"
                  aria-label="Send message"
                  title="Send message"
                >
                  {status === "thinking" ? (
                    <Loader2 className="animate-spin" size={19} aria-hidden="true" />
                  ) : (
                    <Send size={19} aria-hidden="true" />
                  )}
                </button>
              </div>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}

function ProfilePanel({
  authors,
  selectedAuthor,
  profile,
  parseResult,
  onAuthorChange,
  onTrainingDownload,
}: {
  authors: Array<{ name: string; count: number }>;
  selectedAuthor: string;
  profile: PersonaProfile | null;
  parseResult: DiscordParseResult | null;
  onAuthorChange: (author: string) => void;
  onTrainingDownload: () => void;
}) {
  if (!profile || !parseResult) {
    return (
      <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-[var(--muted)]">
          <UserRound size={18} aria-hidden="true" />
          <h2 className="font-semibold text-[var(--foreground)]">Persona profile</h2>
        </div>
        <p className="text-sm leading-6 text-[var(--muted)]">
          The profile will show message counts, writing samples, recurring terms, and export controls after parsing.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Persona profile</h2>
          <p className="text-sm text-[var(--muted)]">
            {parseResult.filesRead} files read, {parseResult.warnings.length} warnings
          </p>
        </div>
        <UserRound className="text-[var(--coral)]" size={22} aria-hidden="true" />
      </div>

      {authors.length > 0 ? (
        <label className="mb-4 block text-sm font-medium">
          Author
          <select
            value={selectedAuthor}
            onChange={(event) => onAuthorChange(event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(21,107,95,0.12)]"
          >
            {authors.map((author) => (
              <option key={author.name} value={author.name}>
                {author.name} ({author.count.toLocaleString()})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Messages" value={profile.messageCount.toLocaleString()} />
        <Stat label="Avg chars" value={profile.stats.averageCharacters.toString()} />
        <Stat label="Questions" value={`${Math.round(profile.stats.questionRate * 100)}%`} />
        <Stat label="Exclaims" value={`${Math.round(profile.stats.exclamationRate * 100)}%`} />
      </dl>

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Recurring terms</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {profile.topTerms.length > 0 ? (
            profile.topTerms.slice(0, 10).map((term) => (
              <span
                key={term}
                className="rounded bg-[rgba(198,132,30,0.13)] px-2 py-1 text-xs font-medium text-[#704708]"
              >
                {term}
              </span>
            ))
          ) : (
            <span className="text-sm text-[var(--muted)]">No recurring terms yet.</span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Sample lines</h3>
        <div className="mt-2 space-y-2">
          {profile.sampleMessages.slice(0, 3).map((sample) => (
            <p key={sample} className="rounded-md bg-[#f5efe5] px-3 py-2 text-sm leading-5 text-[var(--muted)]">
              {sample}
            </p>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onTrainingDownload}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-white text-sm font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <Download size={16} aria-hidden="true" />
        Export fine-tune JSONL
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[#fbf7ef] px-3 py-2">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatTurn }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-md px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? "bg-[var(--panel-strong)] text-white"
            : "border border-[var(--line)] bg-white text-[var(--foreground)]"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold opacity-70">
          {isUser ? <UserRound size={13} aria-hidden="true" /> : <Bot size={13} aria-hidden="true" />}
          {isUser ? "You" : "Persona"}
        </div>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}
