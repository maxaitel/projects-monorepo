import type { ActionResult, HostAction, RoomPhase, RoomSnapshot } from "./types";

export const PHASE_DURATIONS_MS = {
  prompt: 4_000,
  submit: 60_000,
  vote: 30_000,
  reveal: 8_000,
} as const;

export const MIN_PLAYERS_TO_AUTO_START = 2;
export const LOBBY_START_DELAY_MS = 5_000;

export function validateRoomAction(
  room: RoomSnapshot,
  actorPlayerId: string,
  action: HostAction,
): ActionResult {
  if (action === "start_match" && room.phase !== "lobby") {
    return { ok: false, reason: "The match has already started." };
  }

  if (actorPlayerId !== room.hostPlayerId) {
    return { ok: false, reason: "Only the host can do that." };
  }

  return { ok: true };
}

export function getNextPhase(
  phase: RoomPhase,
  turn?: Pick<RoomSnapshot, "turnIndex" | "maxTurns">,
): RoomPhase {
  if (phase === "lobby") return "prompt";
  if (phase === "prompt") return "submit";
  if (phase === "submit") return "vote";
  if (phase === "vote") return "reveal";
  if (phase === "reveal") {
    if (turn && turn.turnIndex + 1 >= turn.maxTurns) return "recap";
    return "prompt";
  }
  return "recap";
}

export function canAdvancePhase(room: RoomSnapshot): ActionResult {
  if (room.phase === "submit") {
    const missing = countMissing(room.requiredSubmitterIds, room.submittedPlayerIds);
    if (missing > 0) {
      return {
        ok: false,
        reason: `Waiting for ${missing} ${missing === 1 ? "player" : "players"} to submit.`,
      };
    }
  }

  if (room.phase === "vote") {
    const missing = countMissing(room.requiredVoterIds, room.votedPlayerIds);
    if (missing > 0) {
      return {
        ok: false,
        reason: `Waiting for ${missing} ${missing === 1 ? "player" : "players"} to vote.`,
      };
    }
  }

  return { ok: true };
}

export function canAutoStartMatch(room: RoomSnapshot, now = new Date()): ActionResult {
  const delayMs = getAutoStartDelayMs(room, now);

  if (delayMs === 0) {
    return { ok: true };
  }

  if (room.phase !== "lobby") {
    return { ok: false, reason: "The room is not in the lobby." };
  }

  if (room.connectedPlayerIds.length < MIN_PLAYERS_TO_AUTO_START) {
    return { ok: false, reason: "Waiting for another player." };
  }

  return { ok: false, reason: "Waiting for the lobby timer." };
}

export function getAutoStartDelayMs(room: RoomSnapshot, now = new Date()): number | null {
  if (room.phase !== "lobby" || room.connectedPlayerIds.length < MIN_PLAYERS_TO_AUTO_START) {
    return null;
  }

  const elapsedMs = getPhaseElapsedMs(room, now);
  if (elapsedMs === null) {
    return null;
  }

  return Math.max(LOBBY_START_DELAY_MS - elapsedMs, 0);
}

export function canAutoAdvancePhase(room: RoomSnapshot, now = new Date()): ActionResult {
  const delayMs = getAutoAdvanceDelayMs(room, now);

  if (delayMs === 0) {
    return { ok: true };
  }

  if (room.phase === "prompt") {
    return { ok: false, reason: "Waiting for the prompt timer." };
  }

  if (room.phase === "submit") {
    if (room.submittedPlayerIds.length === 0 && isPhaseTimerExpired(room, now)) {
      return { ok: false, reason: "Waiting for at least one reply." };
    }

    const missing = countMissing(room.requiredSubmitterIds, room.submittedPlayerIds);
    return {
      ok: false,
      reason: `Waiting for ${missing} ${missing === 1 ? "player" : "players"} to submit.`,
    };
  }

  if (room.phase === "vote") {
    const missing = countMissing(room.requiredVoterIds, room.votedPlayerIds);
    return {
      ok: false,
      reason: `Waiting for ${missing} ${missing === 1 ? "player" : "players"} to vote.`,
    };
  }

  if (room.phase === "reveal") {
    return { ok: false, reason: "Waiting for the reveal timer." };
  }

  return { ok: false, reason: "The room is not in an automatic phase." };
}

export function getAutoAdvanceDelayMs(room: RoomSnapshot, now = new Date()): number | null {
  if (room.phase === "lobby" || room.phase === "recap") {
    return null;
  }

  if (room.phase === "submit") {
    if (room.submittedPlayerIds.length === 0) {
      return null;
    }

    if (countMissing(room.requiredSubmitterIds, room.submittedPlayerIds) === 0) {
      return 0;
    }
  }

  if (room.phase === "vote") {
    if (countMissing(room.requiredVoterIds, room.votedPlayerIds) === 0) {
      return 0;
    }
  }

  const durationMs = getPhaseDurationMs(room.phase);
  if (durationMs === null) {
    return null;
  }

  const elapsedMs = getPhaseElapsedMs(room, now);
  if (elapsedMs === null) {
    return null;
  }

  return Math.max(durationMs - elapsedMs, 0);
}

function countMissing(requiredIds: string[], completedIds: string[]): number {
  const completed = new Set(completedIds);
  return requiredIds.filter((id) => !completed.has(id)).length;
}

function isPhaseTimerExpired(room: RoomSnapshot, now: Date): boolean {
  const durationMs = getPhaseDurationMs(room.phase);
  if (durationMs === null) {
    return false;
  }

  const elapsedMs = getPhaseElapsedMs(room, now);
  return elapsedMs !== null && elapsedMs >= durationMs;
}

function getPhaseElapsedMs(room: Pick<RoomSnapshot, "phaseStartedAt">, now: Date): number | null {
  if (!room.phaseStartedAt) {
    return null;
  }

  const startedAtMs = Date.parse(room.phaseStartedAt);
  if (Number.isNaN(startedAtMs)) {
    return null;
  }

  return Math.max(now.getTime() - startedAtMs, 0);
}

function getPhaseDurationMs(phase: RoomPhase): number | null {
  if (phase === "prompt" || phase === "submit" || phase === "vote" || phase === "reveal") {
    return PHASE_DURATIONS_MS[phase];
  }

  return null;
}
