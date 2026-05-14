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
  kickPlayerAction,
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

  function kickPlayer(playerId: string) {
    const hostPlayerId = initialRoom.currentPlayerId;
    if (!isHost || !hostPlayerId) {
      setError("Only the host can remove players.");
      return;
    }

    runAction(async () => {
      await kickPlayerAction(initialRoom.code, initialRoom.roomId, hostPlayerId, playerId);
      router.refresh();
    });
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-6xl gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_24rem] lg:py-12">
      <section className="grid content-start gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--accent)]">Room Code</p>
            <h1 className="font-display text-4xl font-black tracking-widest text-[var(--foreground)]">
              {initialRoom.code}
            </h1>
          </div>
          <div className="bento-card px-4 py-2">
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--foreground)]">
              Phase: <span className="text-[var(--accent)]">{phase}</span>
            </p>
          </div>
        </div>

        <div className="bento-card p-4 sm:p-6 lg:p-8">
          <ThreadView messages={initialRoom.messages} />
        </div>
      </section>

      <aside className="grid content-start gap-6">
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
          <>
            {hasSubmittedReply ? (
              <SubmittedReplyNotice />
            ) : (
              <SubmitPhase
                disabled={initialRoom.currentPlayerId === null || initialRoom.currentTurnId === null}
                onSubmit={submitReply}
              />
            )}
            {isHost ? (
              <HostActionPanel
                disabled={isActionPending || !initialRoom.currentPlayerId}
                label="Open voting"
                onClick={advancePhase}
              />
            ) : null}
          </>
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
              badges={initialRoom.selectedSubmission.badges}
              isHost={isHost}
              onContinue={advancePhase}
              winningBody={initialRoom.selectedSubmission.body}
            />
          ) : (
            <StatusPanel message="Waiting for the winning reply." />
          )
        ) : null}
        {phase === "recap" ? <RecapScreen scores={initialRoom.players} /> : null}
        <PlayerRecoveryPanel
          disabled={isActionPending}
          isHost={isHost}
          onKick={kickPlayer}
          players={initialRoom.players}
        />
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

function PlayerRecoveryPanel({
  disabled,
  isHost,
  onKick,
  players,
}: {
  disabled: boolean;
  isHost: boolean;
  onKick: (playerId: string) => void;
  players: RoomView["players"];
}) {
  const removablePlayers = players.filter((player) => !player.isHost);

  return (
    <section className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50">
      <div>
        <h2 className="text-sm font-semibold">Players</h2>
        <p className="text-xs text-zinc-400">
          {isHost ? "Remove missing players to keep the round moving." : "Waiting players stay listed here."}
        </p>
      </div>
      <ul className="grid gap-2">
        {players.map((player) => (
          <li
            className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm"
            key={player.id}
          >
            <span className="truncate">{player.name}</span>
            {player.isHost ? <span className="text-xs text-amber-300">Host</span> : null}
            {isHost && !player.isHost ? (
              <button
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
                onClick={() => onKick(player.id)}
                type="button"
              >
                Remove {player.name}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {isHost && removablePlayers.length === 0 ? (
        <p className="text-xs text-zinc-400">No removable players.</p>
      ) : null}
    </section>
  );
}

function RoomActionError({ message }: { message: string }) {
  return (
    <p
      className="bento-card border-red-500/50 bg-red-950/40 p-4 text-sm font-bold text-red-200"
      role="alert"
    >
      Error: {message}
    </p>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Action failed. Try again.";
}
