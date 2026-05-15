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
      phaseStartedAt: "2026-05-14T00:00:00.000Z",
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

  it("automatically starts a lobby match when enough players are present and the timer expires", async () => {
    const startMatch = vi
      .fn<GameRepository["startMatch"]>()
      .mockResolvedValue({ matchId: "match-1", turnId: "turn-1" });
    const repository = createRepository({
      startMatch,
      getRoomSnapshot: vi.fn().mockResolvedValue({
        phase: "lobby",
        phaseStartedAt: "2026-05-14T00:00:00.000Z",
        hostPlayerId: "player-host",
        connectedPlayerIds: ["player-host", "player-two"],
        turnIndex: 0,
        maxTurns: 3,
        requiredSubmitterIds: ["player-host", "player-two"],
        submittedPlayerIds: [],
        requiredVoterIds: [],
        votedPlayerIds: [],
      }),
    });
    const actions = createGameActions(repository, async () => ({ id: "user-2" }));

    await expect(
      actions.startRoomFlow("room-1", new Date("2026-05-14T00:00:05.000Z")),
    ).resolves.toEqual({ matchId: "match-1", turnId: "turn-1" });
    expect(startMatch).toHaveBeenCalledWith({ roomId: "room-1" });
  });

  it("does not automatically start a lobby match before a second player joins", async () => {
    const repository = createRepository({
      getRoomSnapshot: vi.fn().mockResolvedValue({
        phase: "lobby",
        phaseStartedAt: "2026-05-14T00:00:00.000Z",
        hostPlayerId: "player-host",
        connectedPlayerIds: ["player-host"],
        turnIndex: 0,
        maxTurns: 3,
        requiredSubmitterIds: ["player-host"],
        submittedPlayerIds: [],
        requiredVoterIds: [],
        votedPlayerIds: [],
      }),
    });
    const actions = createGameActions(repository, async () => ({ id: "user-2" }));

    await expect(
      actions.startRoomFlow("room-1", new Date("2026-05-14T00:00:05.000Z")),
    ).rejects.toThrow("Waiting for another player.");
    expect(repository.startMatch).not.toHaveBeenCalled();
  });

  it("does not automatically start a lobby match before the timer expires", async () => {
    const repository = createRepository({
      getRoomSnapshot: vi.fn().mockResolvedValue({
        phase: "lobby",
        phaseStartedAt: "2026-05-14T00:00:00.000Z",
        hostPlayerId: "player-host",
        connectedPlayerIds: ["player-host", "player-two"],
        turnIndex: 0,
        maxTurns: 3,
        requiredSubmitterIds: ["player-host", "player-two"],
        submittedPlayerIds: [],
        requiredVoterIds: [],
        votedPlayerIds: [],
      }),
    });
    const actions = createGameActions(repository, async () => ({ id: "user-2" }));

    await expect(
      actions.startRoomFlow("room-1", new Date("2026-05-14T00:00:01.000Z")),
    ).rejects.toThrow("Waiting for the lobby timer.");
    expect(repository.startMatch).not.toHaveBeenCalled();
  });

  it("rejects reveal while eligible voters are still missing", async () => {
    const repository = createRepository({
      getRoomSnapshot: vi.fn().mockResolvedValue({
        phase: "vote",
        phaseStartedAt: "2026-05-14T00:00:00.000Z",
        hostPlayerId: "player-host",
        connectedPlayerIds: ["player-host", "player-two"],
        turnIndex: 0,
        maxTurns: 3,
        requiredSubmitterIds: ["player-host", "player-two"],
        submittedPlayerIds: ["player-host", "player-two"],
        requiredVoterIds: ["player-host", "player-two"],
        votedPlayerIds: ["player-host"],
      }),
    });
    const actions = createGameActions(repository, async () => ({ id: "user-1" }));

    await expect(actions.revealTurn("room-1", "turn-1", "player-host")).rejects.toThrow(
      "Waiting for 1 player to vote.",
    );
    expect(repository.getRoomSnapshot).toHaveBeenCalledWith("room-1");
    expect(repository.revealTurn).not.toHaveBeenCalled();
  });

  it("lets a room member trigger automatic phase advancement when submitters are done", async () => {
    const advancePhase = vi.fn<GameRepository["advancePhase"]>().mockResolvedValue({ phase: "vote" });
    const repository = createRepository({
      advancePhase,
      getRoomSnapshot: vi.fn().mockResolvedValue({
        phase: "submit",
        phaseStartedAt: "2026-05-14T00:00:00.000Z",
        hostPlayerId: "player-host",
        connectedPlayerIds: ["player-host", "player-two"],
        turnIndex: 0,
        maxTurns: 3,
        requiredSubmitterIds: ["player-host", "player-two"],
        submittedPlayerIds: ["player-host", "player-two"],
        requiredVoterIds: ["player-host", "player-two"],
        votedPlayerIds: [],
      }),
    });
    const actions = createGameActions(repository, async () => ({ id: "user-2" }));

    await expect(
      actions.advanceRoomFlow("room-1", new Date("2026-05-14T00:00:01.000Z")),
    ).resolves.toEqual({ phase: "vote" });
    expect(advancePhase).toHaveBeenCalledWith({ roomId: "room-1", nextPhase: "vote" });
  });

  it("rejects automatic prompt advancement before the timer expires", async () => {
    const repository = createRepository({
      getRoomSnapshot: vi.fn().mockResolvedValue({
        phase: "prompt",
        phaseStartedAt: "2026-05-14T00:00:00.000Z",
        hostPlayerId: "player-host",
        connectedPlayerIds: ["player-host", "player-two"],
        turnIndex: 0,
        maxTurns: 3,
        requiredSubmitterIds: ["player-host", "player-two"],
        submittedPlayerIds: [],
        requiredVoterIds: ["player-host", "player-two"],
        votedPlayerIds: [],
      }),
    });
    const actions = createGameActions(repository, async () => ({ id: "user-2" }));

    await expect(
      actions.advanceRoomFlow("room-1", new Date("2026-05-14T00:00:01.000Z")),
    ).rejects.toThrow("Waiting for the prompt timer.");
    expect(repository.advancePhase).not.toHaveBeenCalled();
  });

  it("rejects host self-kick", async () => {
    const repository = createRepository();
    const actions = createGameActions(repository, async () => ({ id: "user-1" }));

    await expect(actions.kickPlayer("room-1", "player-host", "player-host")).rejects.toThrow(
      "The host cannot be kicked.",
    );
    expect(repository.kickPlayer).not.toHaveBeenCalled();
  });
});
