import type { SupabaseClient } from "@supabase/supabase-js";

import type { RoomPhase } from "@/domain/game/types";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type Supabase = SupabaseClient<Database>;

type RoomRow = {
  id: string;
  code: string;
  phase: RoomPhase;
  host_player_id: string | null;
  active_match_id: string | null;
};

type PlayerRow = {
  id: string;
  user_id: string;
  display_name: string;
  score: number;
  kicked_at: string | null;
  created_at: string;
};

type TurnRow = {
  id: string;
  turn_index: number;
  prompt_text: string;
  winning_submission_id: string | null;
};

type SubmissionRow = {
  id: string;
  body: string;
  authorPlayerId: string | null;
  selected?: boolean;
};

export type RoomView = {
  roomId: string;
  code: string;
  phase: RoomPhase;
  hostPlayerId: string | null;
  currentPlayerId: string | null;
  currentTurnId: string | null;
  hasSubmitted: boolean;
  currentPlayerSubmissionId: string | null;
  hasVoted: boolean;
  players: Array<{ id: string; name: string; score: number; isHost: boolean }>;
  messages: Array<{ id: string; side: "you" | "them"; body: string; badge?: string }>;
  submissions: Array<{ id: string; body: string; authorPlayerId: string | null }>;
  selectedSubmission: { id: string; body: string; authorName: string } | null;
};

type MapRoomViewRows = {
  currentUserId: string | null;
  room: RoomRow;
  players: PlayerRow[];
  turns: TurnRow[];
  submissions: SubmissionRow[];
  votedPlayerIds?: string[];
};

export function mapRoomView(rows: MapRoomViewRows): RoomView {
  const activePlayers = rows.players.filter((player) => player.kicked_at === null);
  const players = activePlayers.map((player) => ({
    id: player.id,
    name: player.display_name,
    score: player.score,
    isHost: player.id === rows.room.host_player_id,
  }));
  const currentPlayerId =
    activePlayers.find((player) => player.user_id === rows.currentUserId)?.id ?? null;
  const latestTurn = rows.turns.at(-1) ?? null;
  const authorNames = new Map(players.map((player) => [player.id, player.name]));
  const selectedSubmission = findSelectedSubmission(rows.submissions, latestTurn);
  const messages: RoomView["messages"] = [];

  if (latestTurn) {
    messages.push({
      id: `${latestTurn.id}:prompt`,
      side: "them",
      body: latestTurn.prompt_text,
      badge: "Prompt",
    });
  }

  const currentPlayerSubmission = rows.submissions.find(
    (submission) => submission.authorPlayerId !== null && submission.authorPlayerId === currentPlayerId,
  );
  const currentPlayerSubmissionId = currentPlayerSubmission?.id ?? null;

  if (currentPlayerSubmission && currentPlayerSubmission.id !== selectedSubmission?.id) {
    messages.push({
      id: currentPlayerSubmission.id,
      side: "you",
      body: currentPlayerSubmission.body,
      badge: "Your reply",
    });
  }

  if (selectedSubmission) {
    messages.push({
      id: selectedSubmission.id,
      side: selectedSubmission.authorPlayerId === currentPlayerId ? "you" : "them",
      body: selectedSubmission.body,
      badge: "Winner",
    });
  }

  return {
    roomId: rows.room.id,
    code: rows.room.code,
    phase: rows.room.phase,
    hostPlayerId: rows.room.host_player_id,
    currentPlayerId,
    currentTurnId: latestTurn?.id ?? null,
    hasSubmitted: currentPlayerSubmissionId !== null,
    currentPlayerSubmissionId,
    hasVoted:
      currentPlayerId !== null && (rows.votedPlayerIds ?? []).includes(currentPlayerId),
    players,
    messages,
    submissions: rows.submissions.map((submission) => ({
      id: submission.id,
      body: submission.body,
      authorPlayerId: submission.authorPlayerId,
    })),
    selectedSubmission: selectedSubmission
      ? {
          id: selectedSubmission.id,
          body: selectedSubmission.body,
          authorName: authorNames.get(selectedSubmission.authorPlayerId ?? "") ?? "Unknown",
        }
      : null,
  };
}

export async function loadRoomByCode(code: string): Promise<RoomView | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, code, phase, host_player_id, active_match_id")
    .eq("code", code)
    .maybeSingle();

  if (roomError) {
    throw new Error(roomError.message);
  }

  if (!room) {
    return null;
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, user_id, display_name, score, kicked_at, created_at")
    .eq("room_id", room.id)
    .order("created_at", { ascending: true });

  if (playersError) {
    throw new Error(playersError.message);
  }

  const turns = await loadTurns(supabase, room.active_match_id ? String(room.active_match_id) : null);
  const latestTurn = turns.at(-1) ?? null;
  const currentPlayerId =
    players?.find((player) => player.kicked_at === null && player.user_id === user?.id)?.id ?? null;
  const submissions = latestTurn
    ? await loadSafeSubmissions(supabase, {
        turnId: latestTurn.id,
        phase: room.phase as RoomPhase,
        currentPlayerId: currentPlayerId ? String(currentPlayerId) : null,
      })
    : [];
  const votedPlayerIds =
    room.active_match_id && currentPlayerId ? await loadVotedPlayerIds(supabase, String(room.id)) : [];

  return mapRoomView({
    currentUserId: user?.id ?? null,
    room: {
      id: String(room.id),
      code: String(room.code),
      phase: room.phase as RoomPhase,
      host_player_id: room.host_player_id ? String(room.host_player_id) : null,
      active_match_id: room.active_match_id ? String(room.active_match_id) : null,
    },
    players: (players ?? []).map((player) => ({
      id: String(player.id),
      user_id: String(player.user_id),
      display_name: String(player.display_name),
      score: Number(player.score),
      kicked_at: player.kicked_at ? String(player.kicked_at) : null,
      created_at: String(player.created_at),
    })),
    turns,
    submissions,
    votedPlayerIds,
  });
}

function findSelectedSubmission(submissions: SubmissionRow[], latestTurn: TurnRow | null) {
  return (
    submissions.find((submission) => submission.selected) ??
    submissions.find((submission) => submission.id === latestTurn?.winning_submission_id) ??
    null
  );
}

async function loadTurns(supabase: Supabase, matchId: string | null): Promise<TurnRow[]> {
  if (!matchId) {
    return [];
  }

  const { data, error } = await supabase
    .from("turns")
    .select("id, turn_index, prompt_text, winning_submission_id")
    .eq("match_id", matchId)
    .order("turn_index", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((turn) => ({
    id: String(turn.id),
    turn_index: Number(turn.turn_index),
    prompt_text: String(turn.prompt_text),
    winning_submission_id: turn.winning_submission_id ? String(turn.winning_submission_id) : null,
  }));
}

async function loadSafeSubmissions(
  supabase: Supabase,
  input: {
    turnId: string;
    phase: RoomPhase;
    currentPlayerId: string | null;
  },
): Promise<SubmissionRow[]> {
  const byId = new Map<string, SubmissionRow>();

  if (input.phase === "vote") {
    for (const submission of await loadVoteOptions(supabase, input.turnId)) {
      byId.set(submission.id, submission);
    }
  }

  if (input.phase === "reveal" || input.phase === "recap") {
    for (const submission of await loadRevealSubmissions(supabase, input.turnId)) {
      byId.set(submission.id, submission);
    }
  }

  if (input.currentPlayerId) {
    const ownSubmission = await loadCurrentPlayerSubmission(
      supabase,
      input.turnId,
      input.currentPlayerId,
    );
    if (ownSubmission) {
      byId.set(ownSubmission.id, ownSubmission);
    }
  }

  return [...byId.values()];
}

async function loadVoteOptions(supabase: Supabase, turnId: string): Promise<SubmissionRow[]> {
  const { data, error } = await supabase.rpc("list_vote_options", { p_turn_id: turnId });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((submission) => ({
    id: String(submission.submission_id),
    body: String(submission.body),
    authorPlayerId: null,
  }));
}

async function loadRevealSubmissions(supabase: Supabase, turnId: string): Promise<SubmissionRow[]> {
  const { data, error } = await supabase.rpc("list_reveal_submissions", { p_turn_id: turnId });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((submission) => ({
    id: String(submission.submission_id),
    body: String(submission.body),
    authorPlayerId: String(submission.player_id),
    selected: Boolean(submission.selected),
  }));
}

async function loadCurrentPlayerSubmission(
  supabase: Supabase,
  turnId: string,
  currentPlayerId: string,
): Promise<SubmissionRow | null> {
  const { data, error } = await supabase.rpc("get_player_submission", {
    p_turn_id: turnId,
    p_player_id: currentPlayerId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];
  if (!row) {
    return null;
  }

  return {
    id: String(row.submission_id),
    body: String(row.body),
    authorPlayerId: currentPlayerId,
  };
}

async function loadVotedPlayerIds(supabase: Supabase, roomId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_room_snapshot", { p_room_id: roomId });

  if (error) {
    throw new Error(error.message);
  }

  return (data?.[0]?.voted_player_ids ?? []).map(String);
}
