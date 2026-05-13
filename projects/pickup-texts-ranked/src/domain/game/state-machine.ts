import type { ActionResult, HostAction, RoomPhase, RoomSnapshot } from "./types";

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

function countMissing(requiredIds: string[], completedIds: string[]): number {
  const completed = new Set(completedIds);
  return requiredIds.filter((id) => !completed.has(id)).length;
}
