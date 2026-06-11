import fs from "node:fs/promises";

import { tuneConfigToFlags } from "./tuning.js";

export async function loadConfigProfile(filePath) {
  const profile = JSON.parse(await fs.readFile(filePath, "utf8"));
  return normalizeConfigProfile(profile);
}

export function normalizeConfigProfile(profile = {}) {
  const flags = {
    ...(profile.flags ?? {}),
    ...tuneConfigToFlags(profile.config ?? {}),
  };
  return {
    schemaVersion: profile.schemaVersion ?? 1,
    name: profile.name ?? null,
    description: profile.description ?? null,
    source: profile.source ?? null,
    createdAt: profile.createdAt ?? null,
    config: profile.config ?? null,
    flags: normalizeFlags(flags),
  };
}

export function mergeConfigFlags(flags = {}, profile = {}) {
  const explicitFlags = { ...flags };
  delete explicitFlags.config;
  return {
    ...normalizeFlags(profile.flags ?? {}),
    ...explicitFlags,
  };
}

export function buildBestTuneProfile(bestResult, options = {}) {
  if (!bestResult) return null;
  const config = pickTuneConfig(bestResult);
  const runOptionFlags = optionsToFlags(bestResult.best?.runSummary?.options ?? {});
  const configFlags = tuneConfigToFlags(config);
  return {
    schemaVersion: 1,
    name: options.name ?? bestResult.label ?? "territorial-bot-profile",
    description: options.description ?? "Best config selected from tune-summary.json.",
    source: {
      type: "tune-summary",
      path: options.sourcePath ?? null,
      label: bestResult.label ?? null,
      objective: bestResult.tuneObjective ?? null,
      meanScore: Number.isFinite(bestResult.meanScore) ? bestResult.meanScore : null,
      meanPlacementPercentile: Number.isFinite(bestResult.meanPlacementPercentile)
        ? bestResult.meanPlacementPercentile
        : null,
      meanRank: Number.isFinite(bestResult.meanRank) ? bestResult.meanRank : null,
      top10Rate: Number.isFinite(bestResult.top10Rate) ? bestResult.top10Rate : null,
      games: Number.isFinite(bestResult.games) ? bestResult.games : null,
    },
    createdAt: options.createdAt ?? new Date().toISOString(),
    config,
    flags: normalizeFlags({
      ...runOptionFlags,
      ...configFlags,
    }),
  };
}

function pickTuneConfig(result) {
  const keys = [
    "openingPercent",
    "maxExpansionClicks",
    "spawn",
    "minInterest",
    "resumeInterest",
    "midgameStartSeconds",
    "maxSelectedAttackRatio",
    "maxOpponentTroopRatio",
    "lowAttackSlider",
    "targetProbeCount",
    "reprobeLowAttackOnUnsafeCost",
  ];
  return Object.fromEntries(
    keys
      .filter((key) => result[key] !== undefined && result[key] !== null)
      .map((key) => [key, result[key]]),
  );
}

function normalizeFlags(flags = {}) {
  return Object.fromEntries(
    Object.entries(flags)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

function optionsToFlags(options = {}) {
  const mapping = {
    openingPercent: "opening-percent",
    midgamePercent: "midgame-percent",
    minInterest: "min-interest",
    hardMinInterest: "hard-min-interest",
    resumeInterest: "resume-interest",
    midgameStartSeconds: "midgame-start-seconds",
    maxExpansionClicks: "max-expansion-clicks",
    minAttackTroops: "min-attack-troops",
    probeTargets: "probe-targets",
    targetProbeCount: "target-probe-count",
    targetProbeMs: "target-probe-ms",
    requireAttackLabel: "require-attack-label",
    holdUnknownTargets: "hold-unknown-targets",
    adaptiveAttackSizing: "adaptive-attack-sizing",
    lowAttackSlider: "low-attack-slider",
    normalAttackSlider: "normal-attack-slider",
    highAttackSlider: "high-attack-slider",
    maxSelectedAttackPercent: "max-selected-attack-percent",
    maxSelectedAttackRatio: "max-selected-attack-ratio",
    reprobeLowAttackOnUnsafeCost: "reprobe-low-attack-on-unsafe-cost",
    recoverAttackSliderAfterProgress: "recover-attack-slider-after-progress",
    maxTargetTroopRatio: "max-target-troop-ratio",
    maxOpponentTroopRatio: "max-opponent-troop-ratio",
    weakTargetTroopRatio: "weak-target-troop-ratio",
    stallBackoff: "stall-backoff",
    maxStallStreak: "max-stall-streak",
    minOwnedCellGrowth: "min-owned-cell-growth",
    stallBackoffMs: "stall-backoff-ms",
    failedTargetCooldown: "failed-target-cooldown",
    failedTargetDistance: "failed-target-distance",
    minSuccessfulTargetGrowth: "min-successful-target-growth",
    attackPercentWaitMs: "attack-percent-wait-ms",
    maxDecisionCandidates: "max-decision-candidates",
    maxDecisionSamples: "max-decision-samples",
    policyPath: "policy",
    policyCandidateCount: "policy-candidate-count",
    playerName: "player-name",
    visualCols: "visual-cols",
    visualRows: "visual-rows",
  };
  const flags = Object.fromEntries(
    Object.entries(mapping)
      .filter(([key]) => options[key] !== undefined && options[key] !== null)
      .map(([key, flag]) => [flag, options[key]]),
  );
  if (Number.isFinite(options.spawn?.x) && Number.isFinite(options.spawn?.y)) {
    flags["spawn-x"] = options.spawn.x;
    flags["spawn-y"] = options.spawn.y;
  }
  return flags;
}
