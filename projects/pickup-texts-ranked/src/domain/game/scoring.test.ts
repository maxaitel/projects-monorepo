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
});
