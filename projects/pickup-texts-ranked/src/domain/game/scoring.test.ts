import { describe, expect, it } from "vitest";
import { resolveTurn } from "./scoring";
import type { SubmissionResult } from "./types";

const submissions: SubmissionResult[] = [
  {
    submissionId: "sub-a",
    playerId: "player-a",
    body: "come over, my notes app misses you",
    votes: 2,
    displayOrder: 2,
  },
  {
    submissionId: "sub-b",
    playerId: "player-b",
    body: "wyd but in a federal tone",
    votes: 4,
    displayOrder: 1,
  },
  {
    submissionId: "sub-c",
    playerId: "player-c",
    body: "respectfully, unblock me",
    votes: 1,
    displayOrder: 3,
  },
];

describe("resolveTurn", () => {
  it("selects the highest-voted submission and awards score deltas", () => {
    expect(resolveTurn(submissions)).toEqual({
      winningSubmissionId: "sub-b",
      badges: [
        { playerId: "player-b", type: "brilliant", reason: "Won the room vote." },
        { playerId: "player-c", type: "questionable", reason: "Lowest vote count this turn." },
      ],
      scoreDeltas: {
        "player-a": 10,
        "player-b": 35,
        "player-c": -5,
      },
    });
  });

  it("breaks ties by stable anonymous display order and marks photo finish", () => {
    const tied: SubmissionResult[] = [
      { submissionId: "sub-a", playerId: "player-a", body: "a", votes: 3, displayOrder: 2 },
      { submissionId: "sub-b", playerId: "player-b", body: "b", votes: 3, displayOrder: 1 },
    ];

    expect(resolveTurn(tied)).toEqual({
      winningSubmissionId: "sub-b",
      badges: [
        { playerId: "player-b", type: "photo_finish", reason: "Won a tied vote by photo finish." },
      ],
      scoreDeltas: {
        "player-a": 10,
        "player-b": 25,
      },
    });
  });

  it("scores and badges all tied-lowest submissions consistently", () => {
    const tiedLowest: SubmissionResult[] = [
      { submissionId: "sub-a", playerId: "player-a", body: "a", votes: 3, displayOrder: 1 },
      { submissionId: "sub-b", playerId: "player-b", body: "b", votes: 1, displayOrder: 2 },
      { submissionId: "sub-c", playerId: "player-c", body: "c", votes: 1, displayOrder: 3 },
    ];

    expect(resolveTurn(tiedLowest)).toEqual({
      winningSubmissionId: "sub-a",
      badges: [
        { playerId: "player-a", type: "brilliant", reason: "Won the room vote." },
        { playerId: "player-b", type: "questionable", reason: "Lowest vote count this turn." },
        { playerId: "player-c", type: "questionable", reason: "Lowest vote count this turn." },
      ],
      scoreDeltas: {
        "player-a": 35,
        "player-b": -5,
        "player-c": -5,
      },
    });
  });

  it("rejects duplicate player submissions", () => {
    const duplicatePlayer: SubmissionResult[] = [
      { submissionId: "sub-a", playerId: "player-a", body: "a", votes: 3, displayOrder: 1 },
      { submissionId: "sub-b", playerId: "player-a", body: "b", votes: 1, displayOrder: 2 },
    ];

    expect(() => resolveTurn(duplicatePlayer)).toThrow(
      "Cannot resolve a turn with duplicate playerId: player-a.",
    );
  });

  it("rejects duplicate submission ids", () => {
    const duplicateSubmission: SubmissionResult[] = [
      { submissionId: "sub-a", playerId: "player-a", body: "a", votes: 3, displayOrder: 1 },
      { submissionId: "sub-a", playerId: "player-b", body: "b", votes: 1, displayOrder: 2 },
    ];

    expect(() => resolveTurn(duplicateSubmission)).toThrow(
      "Cannot resolve a turn with duplicate submissionId: sub-a.",
    );
  });
});
