"use client";

import { ThumbsUp } from "lucide-react";

type VoteSubmission = {
  id: string;
  body: string;
};

type VotePhaseProps = {
  submissions: VoteSubmission[];
  disabled?: boolean;
  pendingSubmissionId?: string | null;
  votedSubmissionId?: string | null;
  onVote: (submissionId: string) => void;
};

export function VotePhase({
  submissions,
  disabled = false,
  pendingSubmissionId = null,
  votedSubmissionId = null,
  onVote,
}: VotePhaseProps) {
  const isLocked = disabled || pendingSubmissionId !== null || votedSubmissionId !== null;

  return (
    <section className="grid w-full gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50">
      <h2 className="text-base font-semibold">Vote anonymously</h2>
      <ol className="grid gap-2">
        {submissions.map((submission, index) => {
          const isPending = pendingSubmissionId === submission.id;
          const isSelected = votedSubmissionId === submission.id;

          return (
            <li
              className={`grid gap-3 rounded-md border p-3 ${
                isSelected ? "border-cyan-400 bg-cyan-950/40" : "border-zinc-800 bg-zinc-950"
              }`}
              key={submission.id}
            >
              <div className="grid gap-2">
                <p className="break-words text-sm leading-5 text-zinc-100">{submission.body}</p>
                {isPending ? (
                  <span className="text-xs font-semibold text-amber-300">Vote pending</span>
                ) : null}
                {isSelected ? (
                  <span className="text-xs font-semibold text-cyan-300">Selected</span>
                ) : null}
              </div>
              <button
                aria-label={`Vote for reply ${index + 1}`}
                aria-pressed={isSelected}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-zinc-50 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLocked}
                onClick={() => onVote(submission.id)}
                type="button"
              >
                <ThumbsUp aria-hidden="true" size={17} />
                {isPending ? "Pending" : isSelected ? "Selected" : "Vote"}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
