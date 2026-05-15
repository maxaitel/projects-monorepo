"use client";

import { Trophy } from "lucide-react";

type RevealPhaseProps = {
  winningBody: string;
  authorName: string;
  badges: string[];
};

export function RevealPhase({
  winningBody,
  authorName,
  badges,
}: RevealPhaseProps) {
  return (
    <section className="bento-card grid w-full gap-6 p-6 sm:p-8">
      <div className="flex items-center gap-3 text-[var(--accent)]">
        <Trophy aria-hidden="true" size={24} strokeWidth={2.5} />
        <h2 className="font-display text-xl font-black uppercase tracking-widest">Winning Reply</h2>
      </div>

      <blockquote className="input-solid rounded-xl p-6 shadow-inner">
        <p className="font-display text-2xl sm:text-3xl font-bold leading-snug text-[var(--foreground)]">
          &ldquo;{winningBody}&rdquo;
        </p>
      </blockquote>

      <div className="flex flex-col gap-4 border-t border-[var(--border-color)] pt-6">
        <div>
          <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-[var(--foreground)] opacity-60">Author</span>
          <strong className="font-display text-2xl font-black uppercase tracking-wide text-[var(--foreground)]">{authorName}</strong>
        </div>

        {badges.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Badges">
            {badges.map((badge) => (
              <li className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[var(--accent-fg)]" key={badge}>
                {badge}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p
        className="mt-2 flex h-12 items-center justify-center rounded-lg border border-[var(--border-color)] px-6 text-sm font-bold uppercase tracking-wide text-[var(--foreground)] opacity-80"
        role="status"
      >
        Next turn soon
      </p>
    </section>
  );
}
