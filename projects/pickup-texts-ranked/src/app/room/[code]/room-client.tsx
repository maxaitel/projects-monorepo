"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { LobbyScreen } from "@/components/game/lobby-screen";
import { RecapScreen } from "@/components/game/recap-screen";
import { RevealPhase } from "@/components/game/reveal-phase";
import { SubmitPhase } from "@/components/game/submit-phase";
import { ThreadView } from "@/components/game/thread-view";
import { VotePhase } from "@/components/game/vote-phase";
import type { RoomView } from "@/lib/game/load-room";
import { useRoomRealtime } from "@/lib/game/use-room-realtime";

import {
  advancePhaseAction,
  castVoteAction,
  revealTurnAction,
  startMatchAction,
  submitMessageAction,
} from "./actions";

type RoomClientProps = {
  initialRoom: RoomView;
};

export function RoomClient({ initialRoom }: RoomClientProps) {
  const router = useRouter();
  const [submittedReply, setSubmittedReply] = useState<string | null>(null);
  const [votedSubmissionId, setVotedSubmissionId] = useState<string | null>(null);
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useRoomRealtime(initialRoom.roomId, refresh);

  const phase = initialRoom.phase;
  const isHost =
    initialRoom.currentPlayerId !== null && initialRoom.currentPlayerId === initialRoom.hostPlayerId;
  const hasSubmittedReply = initialRoom.hasSubmitted || submittedReply !== null;
  const voteSubmissions = submittedReply
    ? [{ id: "local", body: submittedReply, authorPlayerId: initialRoom.currentPlayerId }]
    : initialRoom.submissions;
  const visibleSubmissions = voteSubmissions.filter(
    (submission) =>
      initialRoom.currentPlayerId === null ||
      submission.authorPlayerId === null ||
      submission.authorPlayerId !== initialRoom.currentPlayerId,
  );
  const hasVoted = initialRoom.hasVoted || votedSubmissionId !== null;
  const isActionPending = isPending || pendingAction;

  function runAction(action: () => Promise<void>) {
    setError(null);
    setPendingAction(true);
    startTransition(() => {
      void action()
        .catch((actionError: unknown) => {
          setError(getErrorMessage(actionError));
        })
        .finally(() => {
          setPendingAction(false);
        });
    });
  }

  function startMatch() {
    const playerId = initialRoom.currentPlayerId;
    if (!isHost || !playerId) {
      setError("Only the host can start the game.");
      return;
    }

    runAction(async () => {
      await startMatchAction(initialRoom.code, initialRoom.roomId, playerId);
      router.refresh();
    });
  }

  function advancePhase() {
    const playerId = initialRoom.currentPlayerId;
    if (!isHost || !playerId) {
      setError("Only the host can continue.");
      return;
    }

    runAction(async () => {
      await advancePhaseAction(initialRoom.code, initialRoom.roomId, playerId);
      router.refresh();
    });
  }

  async function submitReply(reply: string) {
    if (!initialRoom.currentTurnId || !initialRoom.currentPlayerId) {
      const unavailableError = new Error("Join the room before submitting.");
      setError(unavailableError.message);
      throw unavailableError;
    }

    setError(null);

    try {
      await submitMessageAction(
        initialRoom.code,
        initialRoom.currentTurnId,
        initialRoom.currentPlayerId,
        reply,
      );
      setSubmittedReply(reply);
      router.refresh();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      throw submitError;
    }
  }

  function castVote(submissionId: string) {
    const turnId = initialRoom.currentTurnId;
    const playerId = initialRoom.currentPlayerId;
    if (!turnId || !playerId || hasVoted) {
      setError("Voting is not available right now.");
      return;
    }

    setPendingSubmissionId(submissionId);
    runAction(async () => {
      try {
        await castVoteAction(initialRoom.code, turnId, playerId, submissionId);
        setVotedSubmissionId(submissionId);
        router.refresh();
      } finally {
        setPendingSubmissionId(null);
      }
    });
  }

  function revealTurn() {
    const turnId = initialRoom.currentTurnId;
    const playerId = initialRoom.currentPlayerId;
    if (!isHost || !turnId || !playerId) {
      setError("Reveal is not available right now.");
      return;
    }

    runAction(async () => {
      await revealTurnAction(initialRoom.code, initialRoom.roomId, turnId, playerId);
      router.refresh();
    });
  }

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
            onStart={startMatch}
            players={initialRoom.players}
          />
        ) : null}
        {phase === "prompt" ? (
          isHost ? (
            <HostActionPanel
              disabled={isActionPending || !initialRoom.currentPlayerId}
              label="Open submissions"
              onClick={advancePhase}
            />
          ) : (
            <StatusPanel message="Waiting for host to open submissions." />
          )
        ) : null}
        {phase === "submit" ? (
          hasSubmittedReply ? (
            <SubmittedReplyNotice />
          ) : (
            <SubmitPhase
              disabled={initialRoom.currentPlayerId === null || initialRoom.currentTurnId === null}
              onSubmit={submitReply}
            />
          )
        ) : null}
        {phase === "vote" ? (
          <>
            <VotePhase
              disabled={
                initialRoom.currentPlayerId === null ||
                initialRoom.currentTurnId === null ||
                hasVoted ||
                isActionPending
              }
              onVote={castVote}
              pendingSubmissionId={pendingSubmissionId}
              submissions={visibleSubmissions}
              votedSubmissionId={votedSubmissionId}
            />
            {hasVoted ? <StatusPanel message="Vote recorded. Waiting for the reveal." /> : null}
            {isHost ? (
              <HostActionPanel
                disabled={
                  isActionPending || !initialRoom.currentPlayerId || !initialRoom.currentTurnId
                }
                label="Reveal winner"
                onClick={revealTurn}
              />
            ) : null}
          </>
        ) : null}
        {phase === "reveal" ? (
          initialRoom.selectedSubmission ? (
            <RevealPhase
              authorName={initialRoom.selectedSubmission.authorName}
              badges={[]}
              isHost={isHost}
              onContinue={advancePhase}
              winningBody={initialRoom.selectedSubmission.body}
            />
          ) : (
            <StatusPanel message="Waiting for the winning reply." />
          )
        ) : null}
        {phase === "recap" ? <RecapScreen scores={initialRoom.players} /> : null}
        {error ? <RoomActionError message={error} /> : null}
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

function HostActionPanel({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <section className="grid w-full gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50">
      <button
        className="inline-flex h-10 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {label}
      </button>
    </section>
  );
}

function StatusPanel({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300" role="status">
      {message}
    </section>
  );
}

function RoomActionError({ message }: { message: string }) {
  return (
    <p
      className="rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200"
      role="alert"
    >
      {message}
    </p>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Action failed. Try again.";
}
