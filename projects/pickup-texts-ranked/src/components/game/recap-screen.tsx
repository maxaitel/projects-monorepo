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
    <section className="grid w-full gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50">
      <h2 className="text-base font-semibold">Score recap</h2>
      <ol className="grid gap-2" aria-label="Scores">
        {orderedScores.map((score, index) => (
          <li
            className="grid min-h-11 grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm"
            key={score.id}
          >
            <span className="font-mono text-zinc-500">{index + 1}</span>
            <span className="truncate font-medium">{score.name}</span>
            <span className="font-mono font-semibold text-cyan-300">{score.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
