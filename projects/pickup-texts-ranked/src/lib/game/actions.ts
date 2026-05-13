import { canAdvancePhase, getNextPhase, validateRoomAction } from "@/domain/game/state-machine";
import type { RoomPhase } from "@/domain/game/types";

import type { GameRepository } from "./repository";

export interface CurrentUser {
  id: string;
}

export type GetCurrentUser = () => Promise<CurrentUser>;

export function createGameActions(repository: GameRepository, getCurrentUser: GetCurrentUser) {
  return {
    async createRoom(displayName: string) {
      const user = await getCurrentUser();
      const room = await repository.createRoom({
        hostUserId: user.id,
        displayName: cleanDisplayName(displayName),
      });

      return { code: room.code, hostPlayerId: room.hostPlayerId };
    },

    async joinRoom(code: string, displayName: string) {
      const user = await getCurrentUser();
      const room = await repository.joinRoom({
        code: cleanRoomCode(code),
        userId: user.id,
        displayName: cleanDisplayName(displayName),
      });

      return {
        roomId: room.roomId,
        code: room.code,
        playerId: room.playerId,
      };
    },

    async startMatch(roomId: string, actorPlayerId: string) {
      const snapshot = await repository.getRoomSnapshot(roomId);
      assertActionAllowed(validateRoomAction(snapshot, actorPlayerId, "start_match"));

      return repository.startMatch({ roomId, hostPlayerId: actorPlayerId });
    },

    async submitMessage(turnId: string, playerId: string, body: string) {
      return repository.submitMessage({
        turnId,
        playerId,
        body: cleanMessageBody(body),
      });
    },

    async castVote(turnId: string, voterPlayerId: string, submissionId: string) {
      return repository.castVote({ turnId, voterPlayerId, submissionId });
    },

    async revealTurn(roomId: string, turnId: string, hostPlayerId: string) {
      const snapshot = await repository.getRoomSnapshot(roomId);
      assertActionAllowed(validateRoomAction(snapshot, hostPlayerId, "advance_phase"));
      assertActionAllowed(canAdvancePhase(snapshot));

      return repository.revealTurn({ turnId, hostPlayerId });
    },

    async advancePhase(roomId: string, actorPlayerId: string) {
      const snapshot = await repository.getRoomSnapshot(roomId);
      assertActionAllowed(validateRoomAction(snapshot, actorPlayerId, "advance_phase"));
      assertActionAllowed(canAdvancePhase(snapshot));

      const nextPhase = getNextPhase(snapshot.phase, snapshot);
      return repository.advancePhase({ roomId, actorPlayerId, nextPhase });
    },

    async kickPlayer(roomId: string, actorPlayerId: string, playerId: string) {
      const snapshot = await repository.getRoomSnapshot(roomId);
      assertActionAllowed(validateRoomAction(snapshot, actorPlayerId, "kick_player"));

      if (playerId === snapshot.hostPlayerId) {
        throw new Error("The host cannot be kicked.");
      }

      return repository.kickPlayer({ roomId, hostPlayerId: actorPlayerId, playerId });
    },
  };
}

export async function createRoomAction(displayName: string) {
  "use server";

  return (await createServerGameActions()).createRoom(displayName);
}

export async function joinRoomAction(code: string, displayName: string) {
  "use server";

  return (await createServerGameActions()).joinRoom(code, displayName);
}

export async function startMatchAction(roomId: string, actorPlayerId: string) {
  "use server";

  return (await createServerGameActions()).startMatch(roomId, actorPlayerId);
}

export async function submitMessageAction(turnId: string, playerId: string, body: string) {
  "use server";

  return (await createServerGameActions()).submitMessage(turnId, playerId, body);
}

export async function castVoteAction(
  turnId: string,
  voterPlayerId: string,
  submissionId: string,
) {
  "use server";

  return (await createServerGameActions()).castVote(turnId, voterPlayerId, submissionId);
}

export async function revealTurnAction(roomId: string, turnId: string, hostPlayerId: string) {
  "use server";

  return (await createServerGameActions()).revealTurn(roomId, turnId, hostPlayerId);
}

export async function advancePhaseAction(roomId: string, actorPlayerId: string) {
  "use server";

  return (await createServerGameActions()).advancePhase(roomId, actorPlayerId);
}

export async function kickPlayerAction(roomId: string, actorPlayerId: string, playerId: string) {
  "use server";

  return (await createServerGameActions()).kickPlayer(roomId, actorPlayerId, playerId);
}

function cleanDisplayName(displayName: string): string {
  const cleaned = displayName.trim();

  if (!cleaned) {
    throw new Error("Choose a display name.");
  }

  if (cleaned.length > 24) {
    throw new Error("Display name must be 24 characters or fewer.");
  }

  return cleaned;
}

function cleanRoomCode(code: string): string {
  const cleaned = code.trim().toUpperCase();

  if (!cleaned) {
    throw new Error("Enter a room code.");
  }

  return cleaned;
}

function cleanMessageBody(body: string): string {
  const cleaned = body.trim();

  if (!cleaned) {
    throw new Error("Write a reply before submitting.");
  }

  if (cleaned.length > 220) {
    throw new Error("Replies must be 220 characters or fewer.");
  }

  return cleaned;
}

function assertActionAllowed(result: { ok: true } | { ok: false; reason: string }) {
  if (!result.ok) {
    throw new Error(result.reason);
  }
}

async function createServerGameActions() {
  const [{ ensureAnonymousUser }, { createClient }, { createSupabaseGameRepository }] =
    await Promise.all([
      import("@/lib/auth/anonymous"),
      import("@/lib/supabase/server"),
      import("./supabase-repository"),
    ]);
  const supabase = await createClient();
  const user = await ensureAnonymousUser(supabase);

  return createGameActions(createSupabaseGameRepository(supabase), async () => user);
}

export type GameActions = ReturnType<typeof createGameActions>;
export type { RoomPhase };
