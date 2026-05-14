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
    <section className="bento-card w-full p-6 sm:p-8">
      <h2 className="mb-6 font-display text-2xl font-bold text-[var(--foreground)]">Vote Anonymously</h2>
      <ol className="grid gap-4">
        {submissions.map((submission, index) => {
          const isPending = pendingSubmissionId === submission.id;
          const isSelected = votedSubmissionId === submission.id;

          return (
            <li
              className={`input-solid grid gap-4 rounded-xl p-5 ${
                isSelected ? "border-[var(--accent)] shadow-[0_0_0_2px_var(--accent)]" : ""
              }`}
              key={submission.id}
            >
              <div className="grid gap-2">
                <p className="break-words text-base font-medium leading-relaxed text-[var(--foreground)]">{submission.body}</p>
                {isPending ? (
                  <span className="mt-2 text-xs font-bold uppercase tracking-widest text-[var(--accent)] opacity-80">Vote Pending...</span>
                ) : null}
                {isSelected ? (
                  <span className="mt-2 text-xs font-bold uppercase tracking-widest text-[var(--accent)]">Vote Recorded</span>
                ) : null}
              </div>
              <button
                aria-label={`Vote for reply ${index + 1}`}
                aria-pressed={isSelected}
                className="btn-primary inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-lg px-6 text-sm font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLocked}
                onClick={() => onVote(submission.id)}
                type="button"
              >
                <ThumbsUp aria-hidden="true" size={18} fill={isSelected ? "currentColor" : "none"} />
                {isPending ? "Pending..." : isSelected ? "Voted" : "Vote"}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
