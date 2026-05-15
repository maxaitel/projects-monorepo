import type { RoomPhase, RoomSnapshot, TurnResolution } from "@/domain/game/types";

export interface CreatedRoom {
  roomId: string;
  code: string;
  hostPlayerId: string;
  hostUserId: string;
  displayName: string;
}

export interface JoinedRoom {
  roomId: string;
  code: string;
  playerId: string;
  userId: string;
  displayName: string;
}

export interface GameRepository {
  createRoom(input: { hostUserId: string; displayName: string }): Promise<CreatedRoom>;
  joinRoom(input: { code: string; userId: string; displayName: string }): Promise<JoinedRoom>;
  getRoomSnapshot(roomId: string): Promise<RoomSnapshot>;
  startMatch(input: { roomId: string; hostPlayerId?: string }): Promise<{ matchId: string; turnId: string }>;
  submitMessage(input: {
    turnId: string;
    playerId: string;
    body: string;
  }): Promise<{ submissionId: string; body: string }>;
  castVote(input: {
    turnId: string;
    voterPlayerId: string;
    submissionId: string;
  }): Promise<{ voteId: string; submissionId: string }>;
  revealTurn(input: { turnId: string; hostPlayerId: string }): Promise<TurnResolution>;
  advancePhase(input: {
    roomId: string;
    nextPhase: RoomPhase;
  }): Promise<{ phase: RoomPhase }>;
  kickPlayer(input: {
    roomId: string;
    hostPlayerId: string;
    playerId: string;
  }): Promise<{ playerId: string; kicked: true }>;
}
