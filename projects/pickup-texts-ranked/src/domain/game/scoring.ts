import type { BadgeAward, SubmissionResult, TurnResolution } from "./types";

export function resolveTurn(submissions: SubmissionResult[]): TurnResolution {
  if (submissions.length === 0) {
    throw new Error("Cannot resolve a turn without submissions.");
  }

  const sorted = [...submissions].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.displayOrder - b.displayOrder;
  });

  const winner = sorted[0];
  const topVoteCount = winner.votes;
  const tiedWinners = sorted.filter((submission) => submission.votes === topVoteCount);
  const lowestVoteCount = Math.min(...submissions.map((submission) => submission.votes));
  const lowest = sorted.findLast((submission) => submission.votes === lowestVoteCount);

  const badges: BadgeAward[] = [];
  if (tiedWinners.length > 1) {
    badges.push({
      playerId: winner.playerId,
      type: "photo_finish",
      reason: "Won a tied vote by photo finish.",
    });
  } else {
    badges.push({
      playerId: winner.playerId,
      type: "brilliant",
      reason: "Won the room vote.",
    });
  }

  if (lowest && lowest.playerId !== winner.playerId && submissions.length > 2) {
    badges.push({
      playerId: lowest.playerId,
      type: "questionable",
      reason: "Lowest vote count this turn.",
    });
  }

  const scoreDeltas = Object.fromEntries(
    submissions.map((submission) => [
      submission.playerId,
      getScoreDelta(submission, winner, tiedWinners.length > 1, lowest, submissions.length),
    ]),
  );

  return {
    winningSubmissionId: winner.submissionId,
    badges,
    scoreDeltas,
  };
}

function getScoreDelta(
  submission: SubmissionResult,
  winner: SubmissionResult,
  isTiedWin: boolean,
  lowest: SubmissionResult | undefined,
  submissionCount: number,
): number {
  if (submission.playerId === winner.playerId) {
    return isTiedWin ? 25 : 35;
  }

  if (submissionCount > 2 && lowest?.playerId === submission.playerId) {
    return -5;
  }

  return submission.votes > 0 ? 10 : -5;
}
