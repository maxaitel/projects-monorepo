export function advanceTargetMemory(memory = {}) {
  return {
    ...memory,
    failedTargets: (memory.failedTargets ?? [])
      .map((entry) => ({
        ...entry,
        remaining: entry.remaining - 1,
      }))
      .filter((entry) => entry.remaining > 0),
  };
}

export function shouldRememberFailedTarget(progress, options = {}) {
  const minSuccessfulTargetGrowth = options.minSuccessfulTargetGrowth ?? 1;
  return (
    progress &&
    Number.isFinite(progress.ownedCellGrowth) &&
    progress.ownedCellGrowth < minSuccessfulTargetGrowth
  );
}

export function rememberFailedTarget(memory = {}, target, options = {}) {
  if (!isPoint(target)) return normalizeMemory(memory);
  const cooldown = Math.max(1, options.failedTargetCooldown ?? 5);
  const distance = options.failedTargetDistance ?? 0.09;
  const maxFailedTargets = options.maxFailedTargets ?? 12;
  const entry = {
    target: { x: target.x, y: target.y },
    remaining: cooldown,
    distance,
    reason: options.reason ?? "no-growth",
    ownedCellGrowth: Number.isFinite(options.ownedCellGrowth) ? options.ownedCellGrowth : null,
  };
  const failedTargets = activeFailedTargets(memory)
    .filter((existing) => pointDistance(existing.target, entry.target) >= existing.distance)
    .concat(entry)
    .slice(-maxFailedTargets);
  return {
    ...memory,
    failedTargets,
  };
}

export function activeFailedTargets(memory = {}) {
  return (memory.failedTargets ?? [])
    .filter((entry) => isPoint(entry.target))
    .filter((entry) => entry.remaining > 0)
    .map((entry) => ({
      ...entry,
      distance: Number.isFinite(entry.distance) ? entry.distance : 0.09,
    }));
}

function normalizeMemory(memory = {}) {
  return {
    ...memory,
    failedTargets: activeFailedTargets(memory),
  };
}

function isPoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function pointDistance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return Math.sqrt(dx * dx + dy * dy);
}
