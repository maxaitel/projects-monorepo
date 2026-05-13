"use client";

import { ThumbsUp } from "lucide-react";

type VoteSubmission = {
  id: string;
  body: string;
};

type VotePhaseProps = {
  submissions: VoteSubmission[];
  onVote: (submissionId: string) => void;
};

export function VotePhase({ submissions, onVote }: VotePhaseProps) {
  return (
    <section className="grid w-full gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50">
      <h2 className="text-base font-semibold">Vote anonymously</h2>
      <ol className="grid gap-2">
        {submissions.map((submission, index) => (
          <li className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3" key={submission.id}>
            <p className="break-words text-sm leading-5 text-zinc-100">{submission.body}</p>
            <button
              aria-label={`Vote for reply ${index + 1}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-zinc-50 transition hover:bg-zinc-800"
              onClick={() => onVote(submission.id)}
              type="button"
            >
              <ThumbsUp aria-hidden="true" size={17} />
              Vote
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
