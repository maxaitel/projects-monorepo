"use client";

import { useCallback, useState } from "react";

import { LobbyScreen } from "@/components/game/lobby-screen";
import { RecapScreen } from "@/components/game/recap-screen";
import { RevealPhase } from "@/components/game/reveal-phase";
import { SubmitPhase } from "@/components/game/submit-phase";
import { ThreadView } from "@/components/game/thread-view";
import { VotePhase } from "@/components/game/vote-phase";
import { useRoomRealtime } from "@/lib/game/use-room-realtime";

type Phase = "lobby" | "submit" | "vote" | "reveal" | "recap";

type RoomClientProps = {
  code: string;
  roomId: string | null;
};

const players = [
  { id: "p1", name: "Mina", isHost: true, score: 35 },
  { id: "p2", name: "Jules", isHost: false, score: 22 },
  { id: "p3", name: "Tavi", isHost: false, score: 18 },
];

const threadMessages = [
  { id: "m1", side: "them" as const, body: "wyd tonight?" },
  { id: "m2", side: "you" as const, body: "letting a room full of friends draft my reply", badge: "Prompt" },
];

const submissions = [
  { id: "s1", body: "probably becoming someone else's lore in the group chat" },
  { id: "s2", body: "free after 8, emotionally available after snacks" },
  { id: "s3", body: "ranking possible answers with a deeply unserious committee" },
];

const phaseLabels: Record<Phase, string> = {
  lobby: "Lobby",
  submit: "Submit",
  vote: "Vote",
  reveal: "Reveal",
  recap: "Recap",
};

export function RoomClient({ code, roomId }: RoomClientProps) {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [submittedReply, setSubmittedReply] = useState<string | null>(null);
  const [votedSubmissionId, setVotedSubmissionId] = useState<string | null>(null);
  const refetch = useCallback(() => {}, []);

  useRoomRealtime(roomId, refetch);

  const visibleSubmissions = submittedReply
    ? [{ id: "local", body: submittedReply }, ...submissions]
    : submissions;

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-6">
      <section className="grid content-start gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Room</p>
            <h1 className="font-mono text-2xl font-bold tracking-[0.18em] text-zinc-50">{code}</h1>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Demo phase">
            {(Object.keys(phaseLabels) as Phase[]).map((demoPhase) => (
              <button
                className={`h-9 rounded-md border px-3 text-xs font-semibold transition ${
                  phase === demoPhase
                    ? "border-cyan-400 bg-cyan-400 text-zinc-950"
                    : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                }`}
                key={demoPhase}
                onClick={() => setPhase(demoPhase)}
                type="button"
              >
                {phaseLabels[demoPhase]}
              </button>
            ))}
          </nav>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 sm:p-4">
          <ThreadView messages={threadMessages} />
        </div>
      </section>

      <aside className="grid content-start gap-4">
        {phase === "lobby" ? (
          <LobbyScreen
            code={code}
            isHost
            onStart={() => setPhase("submit")}
            players={players}
          />
        ) : null}
        {phase === "submit" ? (
          <SubmitPhase
            disabled={false}
            onSubmit={(reply) => {
              setSubmittedReply(reply);
              setPhase("vote");
            }}
          />
        ) : null}
        {phase === "vote" ? (
          <VotePhase
            onVote={(submissionId) => setVotedSubmissionId(submissionId)}
            submissions={visibleSubmissions}
            votedSubmissionId={votedSubmissionId}
          />
        ) : null}
        {phase === "reveal" ? (
          <RevealPhase
            authorName="Jules"
            badges={["room favorite", "late-night energy"]}
            isHost
            onContinue={() => setPhase("recap")}
            winningBody="free after 8, emotionally available after snacks"
          />
        ) : null}
        {phase === "recap" ? <RecapScreen scores={players} /> : null}
      </aside>
    </main>
  );
}
