import { scoreTelemetry, summarizePlacement, summarizeTelemetry } from "./telemetry.js";

export function summarizeBotRun({
  log = [],
  telemetry = {},
  mode = "unknown",
  durationMs = null,
  tickMs = null,
  options = {},
  decisionSamples = [],
} = {}) {
  const actionCounts = {};
  const waitsByReason = {};
  const phases = {};
  let targetProbeSampleCount = 0;
  let targetProbeCount = 0;
  let firstAt = null;
  let lastAt = null;

  for (const entry of log) {
    const type = entry.action?.type ?? "unknown";
    actionCounts[type] = (actionCounts[type] ?? 0) + 1;
    if (Number.isFinite(entry.at)) {
      firstAt = firstAt === null ? entry.at : Math.min(firstAt, entry.at);
      lastAt = lastAt === null ? entry.at : Math.max(lastAt, entry.at);
    }

    const meta = entry.action?.meta ?? {};
    if (type === "wait" && meta.reason) {
      waitsByReason[meta.reason] = (waitsByReason[meta.reason] ?? 0) + 1;
    }
    if (meta.phase) {
      phases[meta.phase] = (phases[meta.phase] ?? 0) + 1;
    }
  }

  for (const sample of decisionSamples) {
    const probes = sample.targetProbes ?? [];
    if (probes.length) targetProbeSampleCount += 1;
    targetProbeCount += probes.length;
  }

  return {
    mode,
    durationMs,
    tickMs,
    observedRunMs: firstAt === null || lastAt === null ? 0 : lastAt - firstAt,
    actions: {
      total: log.length,
      counts: actionCounts,
    },
    waitsByReason,
    phases,
    decisionSamples: {
      total: decisionSamples.length,
      withTargetProbes: targetProbeSampleCount,
      targetProbeCount,
    },
    score: scoreTelemetry(telemetry),
    placement: summarizePlacement(telemetry),
    final: summarizeTelemetry(telemetry),
    finalTelemetry: telemetry,
    options: summarizeOptions(options),
  };
}

function summarizeOptions(options) {
  const keys = [
    "openingPercent",
    "midgamePercent",
    "spawn",
    "minInterest",
    "hardMinInterest",
    "resumeInterest",
    "midgameStartSeconds",
    "maxExpansionClicks",
    "minAttackTroops",
    "probeTargets",
    "targetProbeCount",
    "targetProbeMs",
    "requireAttackLabel",
    "holdUnknownTargets",
    "adaptiveAttackSizing",
    "lowAttackSlider",
    "normalAttackSlider",
    "highAttackSlider",
    "maxSelectedAttackPercent",
    "maxSelectedAttackRatio",
    "reprobeLowAttackOnUnsafeCost",
    "recoverAttackSliderAfterProgress",
    "maxTargetTroopRatio",
    "maxOpponentTroopRatio",
    "weakTargetTroopRatio",
    "stallBackoff",
    "maxStallStreak",
    "minOwnedCellGrowth",
    "stallBackoffMs",
    "failedTargetCooldown",
    "failedTargetDistance",
    "minSuccessfulTargetGrowth",
    "attackPercentWaitMs",
    "maxDecisionCandidates",
    "maxDecisionSamples",
    "policyPath",
    "policyKind",
    "policyCandidateCount",
    "playerName",
    "visualCols",
    "visualRows",
  ];
  return Object.fromEntries(
    keys
      .filter((key) => options[key] !== undefined && options[key] !== null)
      .map((key) => [key, options[key]]),
  );
}
