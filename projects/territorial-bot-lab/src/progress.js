export function updateTerritoryProgress(previous = {}, decoded = {}, options = {}) {
  const currentOwnedCellCount = finiteOrNull(decoded.ownedCellCount);
  const previousOwnedCellCount = finiteOrNull(previous.ownedCellCount);
  const ownedCellGrowth = currentOwnedCellCount !== null && previousOwnedCellCount !== null
    ? currentOwnedCellCount - previousOwnedCellCount
    : null;
  const minOwnedCellGrowth = options.minOwnedCellGrowth ?? 1;
  const madeProgress = ownedCellGrowth === null || ownedCellGrowth >= minOwnedCellGrowth;
  const stallStreak = madeProgress ? 0 : (previous.stallStreak ?? 0) + 1;

  return {
    ownedCellCount: currentOwnedCellCount,
    previousOwnedCellCount,
    ownedCellGrowth,
    minOwnedCellGrowth,
    madeProgress,
    stallStreak,
  };
}

export function shouldBackoffForTerritoryStall(progress, options = {}) {
  if (!progress) return false;
  if (options.stallBackoff === false) return false;
  const maxStallStreak = options.maxStallStreak ?? 3;
  return progress.stallStreak >= maxStallStreak;
}

export function resetTerritoryStall(progress = {}) {
  return {
    ...progress,
    stallStreak: 0,
  };
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
