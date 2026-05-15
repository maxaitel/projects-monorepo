export type RoomPhase = "lobby" | "prompt" | "submit" | "vote" | "reveal" | "recap";

export type HostAction =
  | "start_match"
  | "advance_phase"
  | "skip_missing_players"
  | "kick_player";

export type ActionResult = { ok: true } | { ok: false; reason: string };

export interface RoomSnapshot {
  phase: RoomPhase;
  phaseStartedAt: string | null;
  hostPlayerId: string;
  connectedPlayerIds: string[];
  turnIndex: number;
  maxTurns: number;
  requiredSubmitterIds: string[];
  submittedPlayerIds: string[];
  requiredVoterIds: string[];
  votedPlayerIds: string[];
}

export interface SubmissionResult {
  submissionId: string;
  playerId: string;
  body: string;
  votes: number;
  displayOrder: number;
}

export interface BadgeAward {
  playerId: string;
  type: "brilliant" | "check" | "blunder" | "questionable" | "photo_finish";
  reason: string;
}

export interface TurnResolution {
  winningSubmissionId: string;
  badges: BadgeAward[];
  scoreDeltas: Record<string, number>;
}
