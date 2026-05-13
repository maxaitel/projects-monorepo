import { describe, expect, it, vi } from "vitest";

import type { GameRepository } from "./repository";
import { createGameActions } from "./actions";

function createRepository(overrides: Partial<GameRepository> = {}): GameRepository {
  return {
    createRoom: vi.fn().mockResolvedValue({
      roomId: "room-1",
      code: "ABCD",
      hostPlayerId: "player-host",
      hostUserId: "user-1",
      displayName: "Max",
    }),
    joinRoom: vi.fn(),
    getRoomSnapshot: vi.fn().mockResolvedValue({
      phase: "lobby",
      hostPlayerId: "player-host",
      connectedPlayerIds: ["player-host", "player-two"],
      turnIndex: 0,
      maxTurns: 3,
      requiredSubmitterIds: ["player-host", "player-two"],
      submittedPlayerIds: [],
      requiredVoterIds: ["player-host", "player-two"],
      votedPlayerIds: [],
    }),
    startMatch: vi.fn().mockResolvedValue({ matchId: "match-1", turnId: "turn-1" }),
    submitMessage: vi.fn().mockResolvedValue({ submissionId: "submission-1", body: "hey" }),
    castVote: vi.fn(),
    revealTurn: vi.fn(),
    advancePhase: vi.fn(),
    kickPlayer: vi.fn(),
    ...overrides,
  };
}

describe("createGameActions", () => {
  it("creates a room for the current anonymous user and returns the code and host player id", async () => {
    const repository = createRepository();
    const actions = createGameActions(repository, async () => ({ id: "user-1" }));

    await expect(actions.createRoom("Max")).resolves.toEqual({
      code: "ABCD",
      hostPlayerId: "player-host",
    });
    expect(repository.createRoom).toHaveBeenCalledWith({
      hostUserId: "user-1",
      displayName: "Max",
    });
  });

  it("trims submitted message text", async () => {
    const submitMessage = vi
      .fn<GameRepository["submitMessage"]>()
      .mockResolvedValue({ submissionId: "submission-1", body: "call me maybe" });
    const repository = createRepository({ submitMessage });
    const actions = createGameActions(repository, async () => ({ id: "user-1" }));

    await expect(actions.submitMessage("turn-1", "player-1", "  call me maybe  ")).resolves.toEqual({
      submissionId: "submission-1",
      body: "call me maybe",
    });
    expect(submitMessage).toHaveBeenCalledWith({
      turnId: "turn-1",
      playerId: "player-1",
      body: "call me maybe",
    });
  });

  it("rejects empty submitted message text", async () => {
    const repository = createRepository();
    const actions = createGameActions(repository, async () => ({ id: "user-1" }));

    await expect(actions.submitMessage("turn-1", "player-1", "   ")).rejects.toThrow(
      "Write a reply before submitting.",
    );
    expect(repository.submitMessage).not.toHaveBeenCalled();
  });

  it("rejects non-hosts when starting a match", async () => {
    const repository = createRepository();
    const actions = createGameActions(repository, async () => ({ id: "user-1" }));

    await expect(actions.startMatch("room-1", "player-two")).rejects.toThrow(
      "Only the host can do that.",
    );
    expect(repository.getRoomSnapshot).toHaveBeenCalledWith("room-1");
    expect(repository.startMatch).not.toHaveBeenCalled();
  });
});
