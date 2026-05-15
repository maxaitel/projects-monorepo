"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { LobbyScreen } from "@/components/game/lobby-screen";
import { RecapScreen } from "@/components/game/recap-screen";
import { RevealPhase } from "@/components/game/reveal-phase";
import { SubmitPhase } from "@/components/game/submit-phase";
import { ThreadView } from "@/components/game/thread-view";
import { VotePhase } from "@/components/game/vote-phase";
import { getAutoAdvanceDelayMs, getAutoStartDelayMs } from "@/domain/game/state-machine";
import type { RoomView } from "@/lib/game/load-room";
import { useRoomRealtime } from "@/lib/game/use-room-realtime";

import {
  advanceRoomFlowAction,
  castVoteAction,
  kickPlayerAction,
  startRoomFlowAction,
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
  const [autoAdvanceAttemptKey, setAutoAdvanceAttemptKey] = useState<string | null>(null);
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

  const runAction = useCallback((action: () => Promise<void>) => {
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
  }, [startTransition]);

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

  useEffect(() => {
    if (isActionPending) {
      return;
    }

    const autoFlow = getRoomAutoFlow(initialRoom);
    if (autoFlow === null) {
      return;
    }
    const delayMs = autoFlow.delayMs;

    const attemptKey = [
      initialRoom.roomId,
      initialRoom.currentTurnId ?? "none",
      initialRoom.phase,
      initialRoom.phaseStartedAt ?? "none",
      initialRoom.requiredSubmitterCount,
      initialRoom.submittedCount,
      initialRoom.requiredVoterCount,
      initialRoom.votedCount,
    ].join(":");

    if (autoAdvanceAttemptKey === attemptKey) {
      return;
    }

    const autoAction = autoFlow.action;
    const timer = window.setTimeout(() => {
      setAutoAdvanceAttemptKey(attemptKey);
      runAction(async () => {
        if (autoAction === "start") {
          await startRoomFlowAction(initialRoom.code, initialRoom.roomId);
        } else {
          await advanceRoomFlowAction(initialRoom.code, initialRoom.roomId);
        }
        router.refresh();
      });
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    autoAdvanceAttemptKey,
    initialRoom,
    isActionPending,
    router,
    runAction,
  ]);

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
            players={initialRoom.players}
          />
        ) : null}
        {phase === "prompt" ? (
          <StatusPanel message="Submissions open soon." />
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
          </>
        ) : null}
        {phase === "reveal" ? (
          initialRoom.selectedSubmission ? (
            <RevealPhase
              authorName={initialRoom.selectedSubmission.authorName}
              badges={initialRoom.selectedSubmission.badges}
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

function getRoomAutoFlow(room: RoomView): { action: "start" | "advance"; delayMs: number } | null {
  const snapshot = {
    phase: room.phase,
    phaseStartedAt: room.phaseStartedAt,
    hostPlayerId: room.hostPlayerId ?? "",
    connectedPlayerIds: createCountIds("player", room.connectedPlayerCount),
    turnIndex: 0,
    maxTurns: 1,
    requiredSubmitterIds: createCountIds("submitter", room.requiredSubmitterCount),
    submittedPlayerIds: createCountIds("submitter", room.submittedCount),
    requiredVoterIds: createCountIds("voter", room.requiredVoterCount),
    votedPlayerIds: createCountIds("voter", room.votedCount),
  };

  if (room.phase === "lobby") {
    const delayMs = getAutoStartDelayMs(snapshot);
    return delayMs === null ? null : { action: "start", delayMs };
  }

  const delayMs = getAutoAdvanceDelayMs(snapshot);
  return delayMs === null ? null : { action: "advance", delayMs };
}

function createCountIds(prefix: string, count: number): string[] {
  return Array.from({ length: Math.max(count, 0) }, (_, index) => `${prefix}-${index}`);
}
