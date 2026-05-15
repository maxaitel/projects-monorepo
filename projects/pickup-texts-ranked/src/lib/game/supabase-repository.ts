import type { SupabaseClient } from "@supabase/supabase-js";

import type { BadgeAward, RoomPhase, RoomSnapshot, TurnResolution } from "@/domain/game/types";
import type { Database, Json } from "@/lib/database.types";

import type { GameRepository } from "./repository";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 4;
const CREATE_ROOM_ATTEMPTS = 5;

type Supabase = SupabaseClient<Database>;

export function createSupabaseGameRepository(supabase: Supabase): GameRepository {
  return {
    async createRoom(input) {
      for (let attempt = 0; attempt < CREATE_ROOM_ATTEMPTS; attempt += 1) {
        const code = generateRoomCode();
        const { data, error } = await supabase.rpc("create_room", {
          p_room_code: code,
          p_host_name: input.displayName,
        });

        if (error) {
          if (isConflictError(error) && attempt < CREATE_ROOM_ATTEMPTS - 1) {
            continue;
          }

          throw new Error(error.message);
        }

        const row = firstRow(data, "create_room");
        return {
          roomId: row.room_id,
          code: row.room_code,
          hostPlayerId: row.player_id,
          hostUserId: input.hostUserId,
          displayName: input.displayName,
        };
      }

      throw new Error("Could not create a unique room code.");
    },

    async joinRoom(input) {
      const { data, error } = await supabase.rpc("join_room", {
        p_room_code: input.code,
        p_player_name: input.displayName,
      });

      if (error) {
        throw new Error(error.message);
      }

      const row = firstRow(data, "join_room");
      return {
        roomId: row.room_id,
        code: row.room_code,
        playerId: row.player_id,
        userId: input.userId,
        displayName: input.displayName,
      };
    },

    async getRoomSnapshot(roomId) {
      const { data, error } = await supabase.rpc("get_room_snapshot", { p_room_id: roomId });

      if (error) {
        throw new Error(error.message);
      }

      const row = firstRow(data, "get_room_snapshot");
      return {
        phase: row.phase,
        phaseStartedAt: row.phase_started_at,
        hostPlayerId: row.host_player_id,
        connectedPlayerIds: row.connected_player_ids,
        turnIndex: row.turn_index,
        maxTurns: row.max_turns,
        requiredSubmitterIds: row.connected_player_ids,
        submittedPlayerIds: row.submitted_player_ids,
        requiredVoterIds: row.eligible_voter_ids,
        votedPlayerIds: row.voted_player_ids,
      };
    },

    async startMatch(input) {
      const { data, error } = await supabase.rpc("start_match", { p_room_id: input.roomId });

      if (error) {
        throw new Error(error.message);
      }

      const row = firstRow(data, "start_match");
      return { matchId: row.match_id, turnId: row.turn_id };
    },

    async submitMessage(input) {
      const { error } = await supabase
        .from("submissions")
        .insert({
          turn_id: input.turnId,
          player_id: input.playerId,
          body: input.body,
        });

      if (error) {
        throw new Error(error.message);
      }

      const { data, error: readError } = await supabase.rpc("get_player_submission", {
        p_turn_id: input.turnId,
        p_player_id: input.playerId,
      });

      if (readError) {
        throw new Error(readError.message);
      }

      const row = firstRow(data, "get_player_submission");
      return { submissionId: row.submission_id, body: row.body };
    },

    async castVote(input) {
      const { data, error } = await supabase.rpc("cast_vote", {
        p_turn_id: input.turnId,
        p_voter_player_id: input.voterPlayerId,
        p_submission_id: input.submissionId,
      });

      if (error) {
        throw new Error(error.message);
      }

      const row = firstRow(data, "cast_vote");
      return { voteId: row.vote_id, submissionId: row.submission_id };
    },

    async revealTurn(input) {
      return resolveTurnAndBadges(supabase, input.turnId);
    },

    async advancePhase(input) {
      if (input.nextPhase === "reveal") {
        const turnId = await getLatestTurnId(supabase, input.roomId);
        await resolveTurnAndBadges(supabase, turnId);
        return { phase: "reveal" };
      }

      if (input.nextPhase === "prompt") {
        const { data, error } = await supabase.rpc("create_next_turn", { p_room_id: input.roomId });

        if (error) {
          throw new Error(error.message);
        }

        return { phase: firstRow(data, "create_next_turn").phase };
      }

      if (input.nextPhase === "submit" || input.nextPhase === "vote" || input.nextPhase === "recap") {
        const { data, error } = await supabase.rpc("advance_room_phase", {
          p_room_id: input.roomId,
          p_next_phase: input.nextPhase,
        });

        if (error) {
          throw new Error(error.message);
        }

        return { phase: firstRow(data, "advance_room_phase").phase };
      }

      throw new Error(`Unsupported phase transition to ${input.nextPhase}.`);
    },

    async kickPlayer(input) {
      const { data, error } = await supabase
        .from("players")
        .update({ kicked_at: new Date().toISOString(), connected: false })
        .eq("room_id", input.roomId)
        .eq("id", input.playerId)
        .select("id")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return { playerId: String(data.id), kicked: true };
    },
  };
}

async function resolveTurnAndBadges(supabase: Supabase, turnId: string): Promise<TurnResolution> {
  const { data, error } = await supabase.rpc("resolve_turn", { p_turn_id: turnId });

  if (error) {
    throw new Error(error.message);
  }

  const row = firstRow(data, "resolve_turn");
  const { data: badges, error: badgesError } = await supabase
    .from("badges")
    .select("player_id, badge_type, reason")
    .eq("turn_id", turnId);

  if (badgesError) {
    throw new Error(badgesError.message);
  }

  return {
    winningSubmissionId: row.winning_submission_id,
    badges: (badges ?? []).map(
      (badge): BadgeAward => ({
        playerId: String(badge.player_id),
        type: badge.badge_type as BadgeAward["type"],
        reason: String(badge.reason),
      }),
    ),
    scoreDeltas: toScoreDeltas(row.score_deltas),
  };
}

async function getLatestTurnId(supabase: Supabase, roomId: string): Promise<string> {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("active_match_id")
    .eq("id", roomId)
    .single();

  if (roomError) {
    throw new Error(roomError.message);
  }

  if (!room.active_match_id) {
    throw new Error("Room has no active match.");
  }

  const { data: turn, error: turnError } = await supabase
    .from("turns")
    .select("id")
    .eq("match_id", String(room.active_match_id))
    .order("turn_index", { ascending: false })
    .limit(1)
    .single();

  if (turnError) {
    throw new Error(turnError.message);
  }

  return String(turn.id);
}

function firstRow<T>(data: T[] | null, operation: string): T {
  if (!data?.[0]) {
    throw new Error(`${operation} did not return a result.`);
  }

  return data[0];
}

function generateRoomCode(): string {
  let code = "";

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }

  return code;
}

function isConflictError(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || error.message?.toLowerCase().includes("duplicate") === true;
}

function toScoreDeltas(value: Json): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .map(([playerId, delta]) => [playerId, delta]),
  );
}

export type { RoomPhase, RoomSnapshot };
