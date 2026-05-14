"use client";

import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

type SubmitPhaseProps = {
  disabled: boolean;
  onSubmit: (reply: string) => void | Promise<void>;
};

export function SubmitPhase({ disabled, onSubmit }: SubmitPhaseProps) {
  const [reply, setReply] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedReply = reply.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || isSubmitting || !trimmedReply) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(trimmedReply);
      setReply("");
    } catch {
      setError("Could not submit. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="bento-card grid w-full gap-4 p-6 sm:p-8"
      onSubmit={handleSubmit}
    >
      <label className="grid gap-2 text-sm font-bold uppercase tracking-widest text-[var(--foreground)] opacity-90">
        Your Reply
        <textarea
          className="input-solid min-h-32 w-full resize-none rounded-lg p-4 text-base font-medium transition placeholder:text-[var(--foreground)] placeholder:opacity-30"
          disabled={disabled || isSubmitting}
          maxLength={220}
          onChange={(event) => {
            setReply(event.target.value);
            setError(null);
          }}
          placeholder="Type the line the room will vote on..."
          value={reply}
        />
      </label>
      {error ? (
        <p
          className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm font-bold text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-4 mt-2">
        <span className="font-mono text-xs font-bold text-[var(--foreground)] opacity-60">{reply.length}/220</span>
        <button
          className="btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-sm font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || isSubmitting || !trimmedReply}
          type="submit"
        >
          <Send aria-hidden="true" size={18} />
          {isSubmitting ? "Submitting" : "Submit Reply"}
        </button>
      </div>
    </form>
  );
}
