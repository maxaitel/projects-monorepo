import type { BadgeAward, SubmissionResult, TurnResolution } from "./types";

export function resolveTurn(submissions: SubmissionResult[]): TurnResolution {
  if (submissions.length === 0) {
    throw new Error("Cannot resolve a turn without submissions.");
  }

  validateUniqueIds(submissions);

  const sorted = [...submissions].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.displayOrder - b.displayOrder;
  });

  const winner = sorted[0];
  const topVoteCount = winner.votes;
  const tiedWinners = sorted.filter((submission) => submission.votes === topVoteCount);
  const lowestVoteCount = Math.min(...submissions.map((submission) => submission.votes));
  const lowestSubmissions = sorted.filter(
    (submission) => submission.votes === lowestVoteCount && submission.playerId !== winner.playerId,
  );

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

  if (submissions.length > 2) {
    badges.push(
      ...lowestSubmissions.map((submission) => ({
        playerId: submission.playerId,
        type: "questionable" as const,
        reason: "Lowest vote count this turn.",
      })),
    );
  }

  const lowestPlayerIds = new Set(lowestSubmissions.map((submission) => submission.playerId));
  const scoreDeltas = Object.fromEntries(
    submissions.map((submission) => [
      submission.playerId,
      getScoreDelta(submission, winner, tiedWinners.length > 1, lowestPlayerIds, submissions.length),
    ]),
  );

  return {
    winningSubmissionId: winner.submissionId,
    badges,
    scoreDeltas,
  };
}

function validateUniqueIds(submissions: SubmissionResult[]): void {
  const playerIds = new Set<string>();
  const submissionIds = new Set<string>();

  for (const submission of submissions) {
    if (playerIds.has(submission.playerId)) {
      throw new Error(`Cannot resolve a turn with duplicate playerId: ${submission.playerId}.`);
    }
    playerIds.add(submission.playerId);

    if (submissionIds.has(submission.submissionId)) {
      throw new Error(`Cannot resolve a turn with duplicate submissionId: ${submission.submissionId}.`);
    }
    submissionIds.add(submission.submissionId);
  }
}

function getScoreDelta(
  submission: SubmissionResult,
  winner: SubmissionResult,
  isTiedWin: boolean,
  lowestPlayerIds: Set<string>,
  submissionCount: number,
): number {
  if (submission.playerId === winner.playerId) {
    return isTiedWin ? 25 : 35;
  }

  if (submissionCount > 2 && lowestPlayerIds.has(submission.playerId)) {
    return -5;
  }

  return submission.votes > 0 ? 10 : -5;
}
