import { describe, expect, it } from "vitest";
import {
  PHASE_DURATIONS_MS,
  canAdvancePhase,
  canAutoAdvancePhase,
  canAutoStartMatch,
  getAutoAdvanceDelayMs,
  getAutoStartDelayMs,
  getNextPhase,
  validateRoomAction,
  LOBBY_START_DELAY_MS,
} from "./state-machine";
import type { RoomSnapshot } from "./types";

const baseRoom: RoomSnapshot = {
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
};

describe("game state machine", () => {
  it("only allows the host to start a match from lobby", () => {
    expect(validateRoomAction(baseRoom, "player-two", "start_match")).toEqual({
      ok: false,
      reason: "Only the host can do that.",
    });
    expect(validateRoomAction(baseRoom, "player-host", "start_match")).toEqual({ ok: true });
  });

  it("advances through the core room phases", () => {
    expect(getNextPhase("lobby")).toBe("prompt");
    expect(getNextPhase("prompt")).toBe("submit");
    expect(getNextPhase("submit")).toBe("vote");
    expect(getNextPhase("vote")).toBe("reveal");
    expect(getNextPhase("reveal")).toBe("prompt");
  });

  it("blocks submit phase advancement until every connected player submitted", () => {
    const room = { ...baseRoom, phase: "submit" as const, submittedPlayerIds: ["player-host"] };
    expect(canAdvancePhase(room)).toEqual({
      ok: false,
      reason: "Waiting for 1 player to submit.",
    });
  });

  it("allows submit phase advancement when all required players submitted", () => {
    const room = {
      ...baseRoom,
      phase: "submit" as const,
      submittedPlayerIds: ["player-host", "player-two"],
    };
    expect(canAdvancePhase(room)).toEqual({ ok: true });
  });

  it("moves from reveal to recap after the last turn", () => {
    expect(getNextPhase("reveal", { turnIndex: 2, maxTurns: 3 })).toBe("recap");
  });

  it("auto-starts the match after enough players are in the lobby and the start timer expires", () => {
    const room = { ...baseRoom, connectedPlayerIds: ["player-host", "player-two"] };

    expect(getAutoStartDelayMs(room, new Date("2026-05-14T00:00:01.000Z"))).toBe(
      LOBBY_START_DELAY_MS - 1000,
    );
    expect(canAutoStartMatch(room, new Date("2026-05-14T00:00:01.000Z"))).toEqual({
      ok: false,
      reason: "Waiting for the lobby timer.",
    });
    expect(canAutoStartMatch(room, new Date("2026-05-14T00:00:05.000Z"))).toEqual({
      ok: true,
    });
  });

  it("does not auto-start the match until at least two players are in the lobby", () => {
    const room = { ...baseRoom, connectedPlayerIds: ["player-host"] };

    expect(getAutoStartDelayMs(room, new Date("2026-05-14T00:00:05.000Z"))).toBeNull();
    expect(canAutoStartMatch(room, new Date("2026-05-14T00:00:05.000Z"))).toEqual({
      ok: false,
      reason: "Waiting for another player.",
    });
  });

  it("auto-opens submissions only after the prompt timer expires", () => {
    const room = { ...baseRoom, phase: "prompt" as const };

    expect(getAutoAdvanceDelayMs(room, new Date("2026-05-14T00:00:01.000Z"))).toBe(
      PHASE_DURATIONS_MS.prompt - 1000,
    );
    expect(canAutoAdvancePhase(room, new Date("2026-05-14T00:00:01.000Z"))).toEqual({
      ok: false,
      reason: "Waiting for the prompt timer.",
    });
    expect(canAutoAdvancePhase(room, new Date("2026-05-14T00:00:04.000Z"))).toEqual({
      ok: true,
    });
  });

  it("auto-opens voting as soon as every required submitter is done", () => {
    const room = {
      ...baseRoom,
      phase: "submit" as const,
      submittedPlayerIds: ["player-host", "player-two"],
    };

    expect(getAutoAdvanceDelayMs(room, new Date("2026-05-14T00:00:01.000Z"))).toBe(0);
    expect(canAutoAdvancePhase(room, new Date("2026-05-14T00:00:01.000Z"))).toEqual({
      ok: true,
    });
  });

  it("auto-opens voting after the submit timer when at least one reply exists", () => {
    const room = {
      ...baseRoom,
      phase: "submit" as const,
      submittedPlayerIds: ["player-host"],
    };

    expect(canAutoAdvancePhase(room, new Date("2026-05-14T00:01:00.000Z"))).toEqual({
      ok: true,
    });
  });

  it("does not auto-open voting after the submit timer without any replies", () => {
    const room = { ...baseRoom, phase: "submit" as const, submittedPlayerIds: [] };

    expect(canAutoAdvancePhase(room, new Date("2026-05-14T00:01:00.000Z"))).toEqual({
      ok: false,
      reason: "Waiting for at least one reply.",
    });
  });

  it("auto-reveals when voters finish or the vote timer expires", () => {
    const room = {
      ...baseRoom,
      phase: "vote" as const,
      requiredVoterIds: ["player-host", "player-two"],
      votedPlayerIds: ["player-host"],
    };

    expect(canAutoAdvancePhase(room, new Date("2026-05-14T00:00:01.000Z"))).toEqual({
      ok: false,
      reason: "Waiting for 1 player to vote.",
    });
    expect(canAutoAdvancePhase(room, new Date("2026-05-14T00:00:30.000Z"))).toEqual({
      ok: true,
    });
    expect(
      canAutoAdvancePhase(
        { ...room, votedPlayerIds: ["player-host", "player-two"] },
        new Date("2026-05-14T00:00:01.000Z"),
      ),
    ).toEqual({ ok: true });
  });

  it("auto-continues from reveal only after the reveal timer expires", () => {
    const room = { ...baseRoom, phase: "reveal" as const };

    expect(canAutoAdvancePhase(room, new Date("2026-05-14T00:00:01.000Z"))).toEqual({
      ok: false,
      reason: "Waiting for the reveal timer.",
    });
    expect(canAutoAdvancePhase(room, new Date("2026-05-14T00:00:08.000Z"))).toEqual({
      ok: true,
    });
  });
});
