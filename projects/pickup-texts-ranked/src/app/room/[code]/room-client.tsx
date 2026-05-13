"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { LobbyScreen } from "@/components/game/lobby-screen";
import { RecapScreen } from "@/components/game/recap-screen";
import { RevealPhase } from "@/components/game/reveal-phase";
import { SubmitPhase } from "@/components/game/submit-phase";
import { ThreadView } from "@/components/game/thread-view";
import { VotePhase } from "@/components/game/vote-phase";
import type { RoomView } from "@/lib/game/load-room";
import { useRoomRealtime } from "@/lib/game/use-room-realtime";

type RoomClientProps = {
  initialRoom: RoomView;
};

export function RoomClient({ initialRoom }: RoomClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState(initialRoom.phase);
  const [submittedReply, setSubmittedReply] = useState<string | null>(null);
  const [votedSubmissionId, setVotedSubmissionId] = useState<string | null>(null);
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useRoomRealtime(initialRoom.roomId, refresh);

  const isHost =
    initialRoom.currentPlayerId !== null && initialRoom.currentPlayerId === initialRoom.hostPlayerId;
  const currentPlayerSubmission = initialRoom.submissions.find(
    (submission) =>
      initialRoom.currentPlayerId !== null && submission.authorPlayerId === initialRoom.currentPlayerId,
  );
  const hasSubmittedReply = currentPlayerSubmission !== undefined || submittedReply !== null;
  const voteSubmissions = submittedReply
    ? [{ id: "local", body: submittedReply, authorPlayerId: initialRoom.currentPlayerId }]
    : initialRoom.submissions;
  const visibleSubmissions = voteSubmissions.filter(
    (submission) =>
      initialRoom.currentPlayerId === null ||
      submission.authorPlayerId === null ||
      submission.authorPlayerId !== initialRoom.currentPlayerId,
  );

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-6">
      <section className="grid content-start gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Room</p>
            <h1 className="font-mono text-2xl font-bold tracking-[0.18em] text-zinc-50">
              {initialRoom.code}
            </h1>
          </div>
          <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-semibold capitalize text-zinc-200">
            {phase}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 sm:p-4">
          <ThreadView messages={initialRoom.messages} />
        </div>
      </section>

      <aside className="grid content-start gap-4">
        {phase === "lobby" ? (
          <LobbyScreen
            code={initialRoom.code}
            isHost={isHost}
            onStart={() => setPhase("submit")}
            players={initialRoom.players}
          />
        ) : null}
        {phase === "prompt" ? (
          <SubmitPhase disabled onSubmit={() => undefined} />
        ) : null}
        {phase === "submit" ? (
          hasSubmittedReply ? (
            <SubmittedReplyNotice />
          ) : (
            <SubmitPhase
              disabled={initialRoom.currentPlayerId === null}
              onSubmit={(reply) => {
                setSubmittedReply(reply);
                setPhase("vote");
              }}
            />
          )
        ) : null}
        {phase === "vote" ? (
          <VotePhase
            onVote={(submissionId) => setVotedSubmissionId(submissionId)}
            submissions={visibleSubmissions}
            votedSubmissionId={votedSubmissionId}
          />
        ) : null}
        {phase === "reveal" ? (
          initialRoom.selectedSubmission ? (
            <RevealPhase
              authorName={initialRoom.selectedSubmission.authorName}
              badges={[]}
              isHost={isHost}
              onContinue={() => setPhase("recap")}
              winningBody={initialRoom.selectedSubmission.body}
            />
          ) : null
        ) : null}
        {phase === "recap" ? <RecapScreen scores={initialRoom.players} /> : null}
      </aside>
    </main>
  );
}

function SubmittedReplyNotice() {
  return (
    <section
      className="grid w-full gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50"
      role="status"
    >
      <h2 className="text-base font-semibold">Reply submitted</h2>
      <p className="text-sm text-zinc-300">Waiting for the room to finish submitting.</p>
    </section>
  );
}
