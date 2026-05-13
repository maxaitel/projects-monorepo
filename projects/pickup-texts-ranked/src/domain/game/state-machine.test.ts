import { describe, expect, it } from "vitest";
import { canAdvancePhase, getNextPhase, validateRoomAction } from "./state-machine";
import type { RoomSnapshot } from "./types";

const baseRoom: RoomSnapshot = {
  phase: "lobby",
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
});
