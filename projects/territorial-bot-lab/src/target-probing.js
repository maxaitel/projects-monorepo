import { extractTelemetry } from "./telemetry.js";

export function targetProbeCandidates(decoded, fallbackTargets = [], options = {}) {
  const recentTargets = options.recentTargets ?? [];
  const minDistance = options.minRecentDistance ?? 0.06;
  const avoidTargets = options.avoidTargets ?? [];
  const minAvoidDistance = options.minAvoidDistance ?? minDistance;
  const maxCandidates = options.maxCandidates ?? 3;
  const phase = options.phase ?? "midgame-region";
  const candidates = [];

  for (const label of labelTargets(options.mapLabels ?? [], options)) {
    candidates.push(label);
  }

  if (phase === "midgame-region") {
    for (const region of decoded?.neighborRegions ?? []) {
      candidates.push({
        target: region.target,
        source: "neighbor-region",
        visualScore: region.score ?? 0,
        cellCount: region.cellCount ?? null,
        borderCellCount: region.borderCellCount ?? null,
      });
    }
  }

  for (const frontier of decoded?.frontier ?? []) {
    candidates.push({
      target: { x: frontier.x, y: frontier.y },
      source: "frontier",
      visualScore: frontier.score ?? 0,
      cellCount: null,
      borderCellCount: null,
    });
  }

  for (const target of fallbackTargets) {
    candidates.push({
      target,
      source: "fallback",
      visualScore: -1,
      cellCount: null,
      borderCellCount: null,
    });
  }

  return dedupeTargets(candidates)
    .filter((candidate) => isAllowedTarget(candidate.target, {
      recentTargets,
      minDistance,
      avoidTargets,
      minAvoidDistance,
    }))
    .sort(compareCandidatePriority)
    .slice(0, maxCandidates);
}

export async function probeTargets(harness, candidates, options = {}) {
  const waitMs = options.waitMs ?? 120;
  const probes = [];
  for (const candidate of candidates) {
    await harness.hoverCanvas(candidate.target.x, candidate.target.y);
    await harness.wait(waitMs);
    const telemetry = extractTelemetry(await harness.snapshot(), { playerName: options.playerName });
    probes.push({
      ...candidate,
      selectedAttackTroops: telemetry.selectedAttackTroops ?? telemetry.selectedTargetTroops,
      selectedAttackPercent: telemetry.selectedAttackPercent ?? telemetry.selectedTargetPercent,
      selectedAttackRatio: troopRatio(
        telemetry.selectedAttackTroops ?? telemetry.selectedTargetTroops,
        telemetry.ownVisibleTroops,
      ),
      ownVisibleTroops: telemetry.ownVisibleTroops,
      label: candidate.label ?? null,
    });
  }
  return probes;
}

export function chooseTargetFromProbes(probes, baseTelemetry = {}, options = {}) {
  const requireAttackLabel = options.requireAttackLabel ?? false;
  const ownTroops = baseTelemetry.ownVisibleTroops ?? null;
  const scored = probes.map((probe, index) => {
    const targetAnnotated = annotateTargetTroops(probe, ownTroops, options);
    const attackLabelSafe = hasAttackLabel(probe) || !requireAttackLabel;
    const selectedAttackRatio = Number.isFinite(probe.selectedAttackRatio)
      ? probe.selectedAttackRatio
      : troopRatio(probe.selectedAttackTroops, ownTroops);
    const attackCostSafe = selectedAttackSafe(selectedAttackRatio, options);
    const safe = attackLabelSafe && attackCostSafe && targetAnnotated.safe !== false;
    const scoredProbe = {
      ...targetAnnotated,
      selectedAttackRatio,
      attackCostSafe,
    };
    return {
      ...scoredProbe,
      index,
      safe,
      score: probeScore(scoredProbe, ownTroops),
    };
  });
  const pool = scored.filter((probe) => probe.safe);
  if (!pool.length) {
    const reason = scored.some((probe) => !probe.attackCostSafe) ? "no-safe-target" : "no-labeled-target";
    return {
      target: null,
      probe: null,
      probes: scored,
      reason,
    };
  }

  const best = pool.toSorted((a, b) => b.score - a.score)[0];
  return {
    target: best.target,
    probe: best,
    probes: scored,
    reason: hasAttackLabel(best) ? "probe-labeled-target" : "probe-visual-target",
  };
}

export function chooseAttackSliderFromProbe(choice, telemetry = {}, options = {}) {
  if (!choice?.probe) return null;
  const probe = choice.probe;
  const selectedAttackPercent = probe.selectedAttackPercent ?? null;
  const lowSlider = options.lowAttackSlider ?? 0.415;
  const normalSlider = options.normalAttackSlider ?? options.currentAttackSlider ?? 0.455;
  const highSlider = options.highAttackSlider ?? normalSlider;
  const lowInterestThreshold = options.lowInterestAttackThreshold ?? 0.045;
  const highInterestThreshold = options.highInterestAttackThreshold ?? 0.06;
  const maxSelectedAttackPercent = options.maxSelectedAttackPercent ?? 0.34;
  const maxSelectedAttackRatio = options.maxSelectedAttackRatio ?? 0.34;
  const smallRegionRatio = options.smallRegionRatio ?? 0.12;
  const weakTargetTroopRatio = options.weakTargetTroopRatio ?? 0.45;
  const selectedAttackRatio = Number.isFinite(probe.selectedAttackRatio)
    ? probe.selectedAttackRatio
    : troopRatio(probe.selectedAttackTroops, telemetry.ownVisibleTroops);
  const sizeVsOwned = Number.isFinite(probe.sizeVsOwned)
    ? probe.sizeVsOwned
    : Number.isFinite(probe.cellCount) && Number.isFinite(options.ownedCellCount) && options.ownedCellCount > 0
      ? probe.cellCount / options.ownedCellCount
      : null;
  const targetTroopRatio = Number.isFinite(probe.labelTroopRatio)
    ? probe.labelTroopRatio
    : labelTroopRatio(probe, telemetry.ownVisibleTroops);

  if (telemetry.interest !== null && telemetry.interest !== undefined && telemetry.interest < lowInterestThreshold) {
    return { value: lowSlider, reason: "low-interest-attack-size" };
  }

  if (Number.isFinite(selectedAttackPercent) && selectedAttackPercent > maxSelectedAttackPercent) {
    return { value: lowSlider, reason: "cap-selected-attack-percent" };
  }

  if (Number.isFinite(selectedAttackRatio) && selectedAttackRatio > maxSelectedAttackRatio) {
    return { value: lowSlider, reason: "cap-selected-attack-ratio" };
  }

  if (
    Number.isFinite(targetTroopRatio) &&
    targetTroopRatio <= weakTargetTroopRatio &&
    telemetry.interest !== null &&
    telemetry.interest !== undefined &&
    telemetry.interest >= highInterestThreshold
  ) {
    return { value: highSlider, reason: "weak-labeled-target-attack-size" };
  }

  if (
    Number.isFinite(sizeVsOwned) &&
    sizeVsOwned <= smallRegionRatio &&
    telemetry.interest !== null &&
    telemetry.interest !== undefined &&
    telemetry.interest >= highInterestThreshold
  ) {
    return { value: highSlider, reason: "small-region-attack-size" };
  }

  return { value: normalSlider, reason: "normal-attack-size" };
}

function dedupeTargets(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    const key = `${candidate.target.x.toFixed(4)}:${candidate.target.y.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function compareCandidatePriority(a, b) {
  const aUnsafe = a.safe === false ? 1 : 0;
  const bUnsafe = b.safe === false ? 1 : 0;
  if (aUnsafe !== bUnsafe) return aUnsafe - bUnsafe;
  return b.visualScore - a.visualScore;
}

function labelTargets(labels, options) {
  const ownCenter = options.ownCenter ?? { x: 0.5, y: 0.5 };
  return labels
    .filter((label) => label.relation !== "own")
    .filter((label) => Number.isFinite(label.nx) && Number.isFinite(label.ny))
    .map((label) => annotateTargetTroops(
      {
        target: { x: label.nx, y: label.ny },
        source: "map-label",
        visualScore: labelScore(label, ownCenter, options),
        cellCount: null,
        borderCellCount: null,
        label: {
          name: label.name,
          troops: Number.isFinite(label.troops) ? label.troops : null,
          relation: label.relation ?? "unknown",
          x: label.nx,
          y: label.ny,
        },
      },
      options.ownVisibleTroops,
      options,
    ));
}

function labelScore(label, ownCenter, options = {}) {
  const labelBonus = 25;
  const relationBonus = label.relation === "neutral" ? 2 : 1;
  const troopScore = Number.isFinite(label.troops) ? 1 / Math.log10(Math.max(10, label.troops)) : 0.1;
  const dx = label.nx - ownCenter.x;
  const dy = label.ny - ownCenter.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const proximityScore = Math.max(0, 1 - distance / 0.35);
  const ownTroops = options.ownVisibleTroops;
  const ratio = Number.isFinite(label.troops) && Number.isFinite(ownTroops) && ownTroops > 0
    ? label.troops / ownTroops
    : null;
  const weakTargetRatio = options.weakTargetTroopRatio ?? 0.45;
  const troopAdvantageScore = Number.isFinite(ratio)
    ? Math.max(-2, Math.min(2, weakTargetRatio - ratio)) * 3
    : 0;
  return labelBonus + relationBonus + troopScore + proximityScore + troopAdvantageScore;
}

function hasAttackLabel(probe) {
  return Number.isFinite(probe.selectedAttackTroops);
}

function probeScore(probe, ownTroops) {
  const visualScore = Number.isFinite(probe.visualScore) ? probe.visualScore : 0;
  const knownBonus = Number.isFinite(probe.selectedAttackTroops) ? 0.25 : 0;
  const regionBonus = Number.isFinite(probe.cellCount) ? Math.min(1, Math.sqrt(probe.cellCount) / 40) : 0;
  const troopRatio = Number.isFinite(probe.labelTroopRatio)
    ? probe.labelTroopRatio
    : labelTroopRatio(probe, ownTroops);
  const weakTargetScore = Number.isFinite(troopRatio) ? Math.max(-1.5, 0.55 - troopRatio) : 0;
  const attackCostPenalty = Number.isFinite(probe.selectedAttackRatio) ? probe.selectedAttackRatio * 0.4 : 0;
  const unsafePenalty = probe.troopSafe === false ? -100 : 0;
  const attackCostPenaltyUnsafe = probe.attackCostSafe === false ? -100 : 0;
  return visualScore * 0.1 + knownBonus + regionBonus + weakTargetScore - attackCostPenalty + unsafePenalty + attackCostPenaltyUnsafe;
}

function troopRatio(selectedAttackTroops, ownTroops) {
  if (!Number.isFinite(selectedAttackTroops) || !Number.isFinite(ownTroops) || ownTroops <= 0) return null;
  return selectedAttackTroops / ownTroops;
}

function annotateTargetTroops(candidate, ownTroops, options = {}) {
  const ratio = labelTroopRatio(candidate, ownTroops);
  const troopCap = labelTroopCap(candidate, options);
  if (!Number.isFinite(ratio) || !Number.isFinite(troopCap)) {
    return {
      ...candidate,
      labelTroopRatio: null,
      labelTroopCap: troopCap,
      troopSafe: true,
      safe: candidate.safe,
    };
  }
  const troopSafe = ratio <= troopCap;
  return {
    ...candidate,
    labelTroopRatio: ratio,
    labelTroopCap: troopCap,
    troopSafe,
    safe: candidate.safe === false ? false : troopSafe,
  };
}

function labelTroopCap(candidate, options = {}) {
  if (!candidate?.label) return null;
  const relation = candidate?.label?.relation ?? "unknown";
  if (relation === "neutral") return options.maxTargetTroopRatio ?? 0.85;
  return options.maxOpponentTroopRatio ?? 0.65;
}

function selectedAttackSafe(selectedAttackRatio, options = {}) {
  const maxSelectedAttackRatio = options.maxSelectedAttackRatio ?? 0.34;
  return !Number.isFinite(selectedAttackRatio) || selectedAttackRatio <= maxSelectedAttackRatio;
}

function labelTroopRatio(candidate, ownTroops) {
  const targetTroops = candidate?.label?.troops;
  if (!Number.isFinite(targetTroops) || !Number.isFinite(ownTroops) || ownTroops <= 0) return null;
  return targetTroops / ownTroops;
}

function pointDistance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isFreshTarget(target, recentTargets, minDistance) {
  return recentTargets.every((recent) => pointDistance(target, recent) >= minDistance);
}

function isAllowedTarget(target, options) {
  if (!isFreshTarget(target, options.recentTargets, options.minDistance)) return false;
  return options.avoidTargets.every((avoid) => {
    const avoidTarget = avoid.target ?? avoid;
    if (!Number.isFinite(avoidTarget?.x) || !Number.isFinite(avoidTarget?.y)) return true;
    const minDistance = Number.isFinite(avoid.distance) ? avoid.distance : options.minAvoidDistance;
    return pointDistance(target, avoidTarget) >= minDistance;
  });
}
