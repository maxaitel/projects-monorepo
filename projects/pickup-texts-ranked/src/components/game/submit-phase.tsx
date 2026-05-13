"use client";

import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

type SubmitPhaseProps = {
  disabled: boolean;
  onSubmit: (reply: string) => void;
};

export function SubmitPhase({ disabled, onSubmit }: SubmitPhaseProps) {
  const [reply, setReply] = useState("");
  const trimmedReply = reply.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled && trimmedReply) {
      onSubmit(trimmedReply);
      setReply("");
    }
  }

  return (
    <form
      className="grid w-full gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50"
      onSubmit={handleSubmit}
    >
      <label className="grid gap-2 text-sm font-medium text-zinc-200">
        Reply
        <textarea
          className="min-h-28 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
          disabled={disabled}
          maxLength={220}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Type the line the room will vote on..."
          value={reply}
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">{reply.length}/220</span>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || !trimmedReply}
          type="submit"
        >
          <Send aria-hidden="true" size={17} />
          Submit reply
        </button>
      </div>
    </form>
  );
}
