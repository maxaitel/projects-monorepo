type ScoreRow = {
  id: string;
  name: string;
  score: number;
};

type RecapScreenProps = {
  scores: ScoreRow[];
};

export function RecapScreen({ scores }: RecapScreenProps) {
  const orderedScores = [...scores].sort((a, b) => b.score - a.score);

  return (
    <section className="bento-card w-full p-6 sm:p-8">
      <h2 className="mb-6 font-display text-3xl font-black uppercase tracking-wider text-[var(--foreground)]">Final Scores</h2>
      <ol className="grid gap-3" aria-label="Scores">
        {orderedScores.map((score, index) => (
          <li
            className="input-solid grid min-h-14 grid-cols-[3rem_1fr_auto] items-center gap-4 rounded-lg px-4"
            key={score.id}
          >
            <span className={`font-display text-xl font-black ${index === 0 ? "text-[var(--accent)]" : "text-[var(--foreground)] opacity-40"}`}>
              #{index + 1}
            </span>
            <span className="truncate text-base font-bold uppercase tracking-wide text-[var(--foreground)]">{score.name}</span>
            <span className="font-mono text-xl font-bold text-[var(--accent)]">{score.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
