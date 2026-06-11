import fs from "node:fs/promises";
import path from "node:path";

import { summarizePlacement } from "./telemetry.js";

export async function analyzeArtifacts(inputPath = "artifacts") {
  const runSummaryPaths = await findRunSummaryPaths(inputPath);
  const runs = [];

  for (const runSummaryPath of runSummaryPaths) {
    const dir = path.dirname(runSummaryPath);
    const runSummary = JSON.parse(await fs.readFile(runSummaryPath, "utf8"));
    const decisionSamples = await readDecisionSamples(dir);
    runs.push({ dir, runSummary, decisionSamples });
  }

  return summarizeRunArtifacts(runs);
}

export function summarizeRunArtifacts(runs = []) {
  const summary = {
    runs: {
      total: runs.length,
      byMode: {},
    },
    score: {
      mean: null,
      best: null,
      worst: null,
    },
    finalTelemetry: {
      meanRank: null,
      bestRank: null,
      meanTroops: null,
      maxTroops: null,
      meanInterest: null,
    },
    placement: {
      meanPercentile: null,
      bestPercentile: null,
      meanRank: null,
      bestRank: null,
      top10Rate: null,
      top25Rate: null,
      top50Rate: null,
    },
    actions: {},
    waitsByReason: {},
    phases: {},
    decisionSamples: {
      total: 0,
      targetChoicesByReason: {},
    },
    targetProbes: {
      total: 0,
      withSelectedAttackLabel: 0,
      safe: 0,
      attackCostSafe: 0,
      attackCostUnsafe: 0,
      withMapLabel: 0,
      bySource: {},
      byPass: {},
      labelRelations: {},
      meanSelectedAttackPercent: null,
      meanSelectedAttackRatio: null,
    },
    reprobe: {
      lowAttackReprobes: 0,
      byReason: {},
    },
    attackSizing: {
      byReason: {},
      recoveries: 0,
      recoveryByReason: {},
    },
    progress: {
      territoryStallBackoffs: 0,
      meanOwnedCellGrowth: null,
      maxTerritoryStallStreak: null,
    },
    targetMemory: {
      failedTargetsRemembered: 0,
      meanAvoidedTargetCount: null,
      maxFailedTargetCount: null,
    },
    mapLabels: {
      samplesWithLabels: 0,
      total: 0,
      nonOwn: 0,
      byRelation: {},
    },
    bestRuns: [],
  };

  const scores = [];
  const ranks = [];
  const placementPercentiles = [];
  const top10 = [];
  const top25 = [];
  const top50 = [];
  const troops = [];
  const interests = [];
  const selectedAttackPercents = [];
  const selectedAttackRatios = [];
  const ownedCellGrowths = [];
  const territoryStallStreaks = [];
  const avoidedTargetCounts = [];
  const failedTargetCounts = [];

  for (const run of runs) {
    const runSummary = run.runSummary ?? {};
    increment(summary.runs.byMode, runSummary.mode ?? "unknown");

    if (isFiniteNumber(runSummary.score)) scores.push(runSummary.score);
    const finalTelemetry = runSummary.finalTelemetry ?? {};
    if (isFiniteNumber(finalTelemetry.ownRank)) ranks.push(finalTelemetry.ownRank);
    const placement = runSummary.placement ?? summarizePlacement(finalTelemetry);
    if (isFiniteNumber(placement.percentile)) placementPercentiles.push(placement.percentile);
    if (placement.top10 !== null && placement.top10 !== undefined) top10.push(placement.top10 ? 1 : 0);
    if (placement.top25 !== null && placement.top25 !== undefined) top25.push(placement.top25 ? 1 : 0);
    if (placement.top50 !== null && placement.top50 !== undefined) top50.push(placement.top50 ? 1 : 0);
    if (isFiniteNumber(finalTelemetry.ownVisibleTroops)) troops.push(finalTelemetry.ownVisibleTroops);
    if (isFiniteNumber(finalTelemetry.interest)) interests.push(finalTelemetry.interest);

    mergeCounts(summary.actions, runSummary.actions?.counts);
    mergeCounts(summary.waitsByReason, runSummary.waitsByReason);
    mergeCounts(summary.phases, runSummary.phases);

    for (const sample of run.decisionSamples ?? []) {
      summary.decisionSamples.total += 1;
      const choiceReason = sample.targetChoice?.reason;
      if (choiceReason) increment(summary.decisionSamples.targetChoicesByReason, choiceReason);

      const labels = sample.telemetry?.mapLabels ?? [];
      if (labels.length > 0) summary.mapLabels.samplesWithLabels += 1;
      summary.mapLabels.total += labels.length;
      for (const label of labels) {
        const relation = label.relation ?? "unknown";
        increment(summary.mapLabels.byRelation, relation);
        if (relation !== "own") summary.mapLabels.nonOwn += 1;
      }

      const attackSizeReason = sample.action?.meta?.attackSizeReason;
      if (attackSizeReason) increment(summary.attackSizing.byReason, attackSizeReason);
      const actionMeta = sample.action?.meta ?? {};
      const attackSliderRecovery = actionMeta.attackSliderRecovery;
      if (attackSliderRecovery) {
        summary.attackSizing.recoveries += 1;
        increment(summary.attackSizing.recoveryByReason, attackSliderRecovery.reason ?? "unknown");
      }
      if (actionMeta.reason === "territory-stall-backoff") {
        summary.progress.territoryStallBackoffs += 1;
      }
      if (isFiniteNumber(actionMeta.ownedCellGrowth)) ownedCellGrowths.push(actionMeta.ownedCellGrowth);
      if (isFiniteNumber(actionMeta.territoryStallStreak)) {
        territoryStallStreaks.push(actionMeta.territoryStallStreak);
      }
      if (actionMeta.rememberedFailedTarget) {
        summary.targetMemory.failedTargetsRemembered += 1;
      }
      if (actionMeta.reprobeReason) {
        increment(summary.reprobe.byReason, actionMeta.reprobeReason);
        if (actionMeta.reprobeReason === "unsafe-selected-attack-ratio") {
          summary.reprobe.lowAttackReprobes += 1;
        }
      }
      if (isFiniteNumber(actionMeta.avoidedTargetCount)) avoidedTargetCounts.push(actionMeta.avoidedTargetCount);
      if (isFiniteNumber(actionMeta.failedTargetCount)) failedTargetCounts.push(actionMeta.failedTargetCount);

      for (const probe of sample.targetProbes ?? []) {
        summary.targetProbes.total += 1;
        increment(summary.targetProbes.bySource, probe.source ?? "unknown");
        increment(summary.targetProbes.byPass, probe.probePass ?? "unknown");
        if (isFiniteNumber(probe.selectedAttackTroops) || isFiniteNumber(probe.selectedAttackPercent)) {
          summary.targetProbes.withSelectedAttackLabel += 1;
        }
        if (isFiniteNumber(probe.selectedAttackPercent)) {
          selectedAttackPercents.push(probe.selectedAttackPercent);
        }
        if (isFiniteNumber(probe.selectedAttackRatio)) {
          selectedAttackRatios.push(probe.selectedAttackRatio);
        }
        if (probe.safe) summary.targetProbes.safe += 1;
        if (probe.attackCostSafe === true) summary.targetProbes.attackCostSafe += 1;
        if (probe.attackCostSafe === false) summary.targetProbes.attackCostUnsafe += 1;
        if (probe.label) {
          summary.targetProbes.withMapLabel += 1;
          increment(summary.targetProbes.labelRelations, probe.label.relation ?? "unknown");
        }
      }
    }
  }

  summary.score.mean = roundedMean(scores);
  summary.score.best = roundedMax(scores);
  summary.score.worst = roundedMin(scores);
  summary.finalTelemetry.meanRank = roundedMean(ranks);
  summary.finalTelemetry.bestRank = roundedMin(ranks);
  summary.finalTelemetry.meanTroops = roundedMean(troops);
  summary.finalTelemetry.maxTroops = roundedMax(troops);
  summary.finalTelemetry.meanInterest = roundedMean(interests);
  summary.placement.meanPercentile = roundedMean(placementPercentiles);
  summary.placement.bestPercentile = roundedMax(placementPercentiles);
  summary.placement.meanRank = roundedMean(ranks);
  summary.placement.bestRank = roundedMin(ranks);
  summary.placement.top10Rate = roundedMean(top10);
  summary.placement.top25Rate = roundedMean(top25);
  summary.placement.top50Rate = roundedMean(top50);
  summary.targetProbes.meanSelectedAttackPercent = roundedMean(selectedAttackPercents);
  summary.targetProbes.meanSelectedAttackRatio = roundedMean(selectedAttackRatios);
  summary.progress.meanOwnedCellGrowth = roundedMean(ownedCellGrowths);
  summary.progress.maxTerritoryStallStreak = roundedMax(territoryStallStreaks);
  summary.targetMemory.meanAvoidedTargetCount = roundedMean(avoidedTargetCounts);
  summary.targetMemory.maxFailedTargetCount = roundedMax(failedTargetCounts);
  summary.bestRuns = runs
    .filter((run) => isFiniteNumber(run.runSummary?.score))
    .toSorted((a, b) => b.runSummary.score - a.runSummary.score)
    .slice(0, 5)
    .map((run) => ({
      dir: run.dir,
      score: round(run.runSummary.score),
      mode: run.runSummary.mode ?? "unknown",
      final: run.runSummary.final ?? null,
      options: run.runSummary.options ?? {},
    }));

  return summary;
}

async function findRunSummaryPaths(inputPath) {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) {
    if (path.basename(inputPath) !== "run-summary.json") {
      throw new Error(`Expected a run-summary.json file or directory, got ${inputPath}`);
    }
    return [inputPath];
  }

  const paths = [];
  await walk(inputPath, paths);
  return paths.toSorted();
}

async function walk(dir, paths) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, paths);
    } else if (entry.isFile() && entry.name === "run-summary.json") {
      paths.push(entryPath);
    }
  }
}

async function readDecisionSamples(dir) {
  try {
    const text = await fs.readFile(path.join(dir, "decision-samples.ndjson"), "utf8");
    return text
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function mergeCounts(target, source = {}) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (Number.isFinite(value)) target[key] = (target[key] ?? 0) + value;
  }
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function roundedMean(values) {
  if (values.length === 0) return null;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function roundedMin(values) {
  if (values.length === 0) return null;
  return round(Math.min(...values));
}

function roundedMax(values) {
  if (values.length === 0) return null;
  return round(Math.max(...values));
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}
