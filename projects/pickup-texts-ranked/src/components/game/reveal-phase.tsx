"use client";

import { ArrowRight, Trophy } from "lucide-react";

type RevealPhaseProps = {
  winningBody: string;
  authorName: string;
  badges: string[];
  isHost: boolean;
  onContinue: () => void;
};

export function RevealPhase({
  winningBody,
  authorName,
  badges,
  isHost,
  onContinue,
}: RevealPhaseProps) {
  return (
    <section className="grid w-full gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50">
      <div className="flex items-center gap-2 text-amber-300">
        <Trophy aria-hidden="true" size={20} />
        <h2 className="text-base font-semibold">Winning reply</h2>
      </div>
      <blockquote className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm leading-6 text-zinc-100">
        {winningBody}
      </blockquote>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-400">Author</span>
        <strong className="text-sm text-zinc-50">{authorName}</strong>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Badges">
        {badges.map((badge) => (
          <li className="rounded-sm bg-amber-300 px-2 py-1 text-xs font-semibold text-zinc-950" key={badge}>
            {badge}
          </li>
        ))}
      </ul>
      {isHost ? (
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300"
          onClick={onContinue}
          type="button"
        >
          Continue
          <ArrowRight aria-hidden="true" size={17} />
        </button>
      ) : (
        <p className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
          Waiting for host to continue
        </p>
      )}
    </section>
  );
}
