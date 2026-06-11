import { parseTimeSeconds } from "./telemetry.js";

export function recordDecision(context, sample) {
  if (!context || typeof context.recordDecision !== "function") return;
  context.recordDecision({
    phase: sample.phase ?? null,
    reason: sample.reason ?? null,
    telemetry: sample.telemetry ? compactTelemetry(sample.telemetry) : null,
    visual: sample.decoded ? compactVisualState(sample.decoded, sample.options) : null,
    targetProbes: sample.targetProbes ? sample.targetProbes.map(compactTargetProbe) : [],
    targetChoice: sample.targetChoice ? compactTargetChoice(sample.targetChoice) : null,
    action: sample.action ? compactAction(sample.action) : null,
  });
}

export function compactTelemetry(telemetry) {
  return {
    time: telemetry.time ?? null,
    timeSeconds: parseTimeSeconds(telemetry.time),
    playerName: telemetry.playerName ?? null,
    rank: telemetry.ownRank ?? null,
    players: telemetry.players ?? null,
    visibleTroops: telemetry.ownVisibleTroops ?? null,
    leaderboardScore: telemetry.ownLeaderboardScore ?? null,
    percentage: telemetry.percentage ?? null,
    interest: telemetry.interest ?? null,
    income: telemetry.income ?? null,
    selectedAttackTroops: telemetry.selectedAttackTroops ?? telemetry.selectedTargetTroops ?? null,
    selectedAttackPercent: telemetry.selectedAttackPercent ?? telemetry.selectedTargetPercent ?? null,
    mapLabels: (telemetry.mapLabels ?? []).slice(0, 12).map(compactMapLabel),
    ownCenter: telemetry.ownCenter ?? null,
    ownLabel: telemetry.ownLabel ?? null,
  };
}

export function compactVisualState(decoded, options = {}) {
  const maxCandidates = options.maxCandidates ?? 8;
  return {
    grid: decoded.grid,
    center: decoded.center,
    ownedColor: decoded.ownedColor,
    ownedCellCount: decoded.ownedCellCount,
    frontierCount: decoded.frontier.length,
    neighborRegionCount: decoded.neighborRegions.length,
    recommendedTarget: decoded.recommendedTarget,
    recommendedRegionTarget: decoded.recommendedRegionTarget,
    frontier: decoded.frontier.slice(0, maxCandidates).map(compactFrontierTarget),
    neighborRegions: decoded.neighborRegions.slice(0, maxCandidates).map((region) =>
      compactNeighborRegion(region, decoded.ownedCellCount),
    ),
  };
}

function compactAction(action) {
  return {
    type: action.type,
    x: finiteOrNull(action.x),
    y: finiteOrNull(action.y),
    value: finiteOrNull(action.value),
    attackPercent: finiteOrNull(action.attackPercent),
    ms: finiteOrNull(action.ms),
    meta: action.meta ?? null,
  };
}

function compactFrontierTarget(target) {
  return {
    x: target.x,
    y: target.y,
    col: target.col,
    row: target.row,
    rgba: target.rgba,
    score: target.score,
  };
}

function compactNeighborRegion(region, ownedCellCount) {
  return {
    target: region.target,
    cellCount: region.cellCount,
    borderCellCount: region.borderCellCount,
    averageColor: region.averageColor,
    score: region.score,
    sizeVsOwned: ownedCellCount > 0 ? region.cellCount / ownedCellCount : null,
  };
}

function compactTargetProbe(probe) {
  return {
    target: probe.target,
    source: probe.source ?? null,
    probePass: probe.probePass ?? null,
    visualScore: finiteOrNull(probe.visualScore),
    cellCount: finiteOrNull(probe.cellCount),
    borderCellCount: finiteOrNull(probe.borderCellCount),
    sizeVsOwned: finiteOrNull(probe.sizeVsOwned),
    selectedAttackTroops: finiteOrNull(probe.selectedAttackTroops ?? probe.selectedTargetTroops),
    selectedAttackPercent: finiteOrNull(probe.selectedAttackPercent ?? probe.selectedTargetPercent),
    selectedAttackRatio: finiteOrNull(probe.selectedAttackRatio),
    attackCostSafe: probe.attackCostSafe ?? null,
    labelTroopRatio: finiteOrNull(probe.labelTroopRatio),
    labelTroopCap: finiteOrNull(probe.labelTroopCap),
    troopSafe: probe.troopSafe ?? null,
    label: probe.label ? compactTargetLabel(probe.label) : null,
    safe: probe.safe ?? null,
    score: finiteOrNull(probe.score),
    policyScore: finiteOrNull(probe.policyScore),
  };
}

function compactTargetChoice(choice) {
  return {
    reason: choice.reason ?? null,
    target: choice.target ?? null,
    probe: choice.probe ? compactTargetProbe(choice.probe) : null,
  };
}

function compactMapLabel(label) {
  return {
    name: label.name,
    troops: finiteOrNull(label.troops),
    x: finiteOrNull(label.nx),
    y: finiteOrNull(label.ny),
    relation: label.relation ?? null,
  };
}

function compactTargetLabel(label) {
  return {
    name: label.name ?? null,
    troops: finiteOrNull(label.troops),
    relation: label.relation ?? null,
    x: finiteOrNull(label.x),
    y: finiteOrNull(label.y),
  };
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
