import fs from "node:fs/promises";
import path from "node:path";

export const policyFeatureNames = [
  "bias",
  "visualScore",
  "hasSelectedAttack",
  "selectedAttackPercent",
  "selectedAttackRatio",
  "attackCostSafe",
  "selectedAttackOverCap",
  "safe",
  "cellCountLog",
  "borderCellCountLog",
  "sizeVsOwned",
  "sourceMapLabel",
  "sourceNeighborRegion",
  "sourceFrontier",
  "sourceFallback",
  "hasMapLabel",
  "labelNeutral",
  "labelOpponent",
  "labelUnknown",
  "hasLabelTroops",
  "labelTroopRatio",
  "labelTroopOverCap",
  "weakLabelTarget",
  "distanceFromOwnCenter",
];

export async function collectDecisionSamples(inputPath = "artifacts") {
  const files = await findDecisionSampleFiles(inputPath);
  const samples = [];

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    for (const line of text.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      samples.push({ file, sample: JSON.parse(trimmed) });
    }
  }

  return samples;
}

export async function trainPolicyFromArtifacts(inputPath = "artifacts", options = {}) {
  const loaded = await collectDecisionSamples(inputPath);
  const examples = buildTrainingExamples(loaded.map((entry) => entry.sample), options);
  const policy = trainLinearPolicy(examples, options);
  return {
    ...policy,
    inputPath,
    training: {
      ...policy.training,
      files: new Set(loaded.map((entry) => entry.file)).size,
      samples: loaded.length,
      examples: examples.length,
      positives: examples.filter((example) => example.label === 1).length,
    },
  };
}

export async function trainOutcomePolicyFromArtifacts(inputPath = "artifacts", options = {}) {
  const loaded = await collectDecisionSamples(inputPath);
  const byFile = groupDecisionSamplesByFile(loaded);

  const examples = [];
  const outcomeStats = emptyOutcomeStats(options);
  let fileIndex = 0;
  for (const [file, samples] of byFile.entries()) {
    const trainingSet = buildOutcomeTrainingSet(samples, options);
    for (const example of trainingSet.examples) {
      examples.push({
        ...example,
        decisionId: `${fileIndex}:${example.decisionId}`,
        file,
      });
    }
    mergeOutcomeStats(outcomeStats, trainingSet.outcomes);
    fileIndex += 1;
  }
  finalizeOutcomeStats(outcomeStats);

  const policy = trainLinearPolicy(examples, options);
  return {
    ...policy,
    inputPath,
    source: "outcome-labeled-decisions",
    training: {
      ...policy.training,
      files: byFile.size,
      samples: loaded.length,
      examples: examples.length,
      positives: examples.filter((example) => example.label === 1).length,
      outcomes: outcomeStats,
    },
  };
}

export async function evaluatePolicyOnOutcomeArtifacts(inputPath = "artifacts", policy, options = {}) {
  const loaded = await collectDecisionSamples(inputPath);
  const byFile = groupDecisionSamplesByFile(loaded);
  const examples = [];
  const outcomeStats = emptyOutcomeStats(options);
  let fileIndex = 0;

  for (const [file, samples] of byFile.entries()) {
    const trainingSet = buildOutcomeTrainingSet(samples, options);
    for (const example of trainingSet.examples) {
      examples.push({
        ...example,
        decisionId: `${fileIndex}:${example.decisionId}`,
        file,
      });
    }
    mergeOutcomeStats(outcomeStats, trainingSet.outcomes);
    fileIndex += 1;
  }
  finalizeOutcomeStats(outcomeStats);

  const evaluation = evaluatePolicyExamples(examples, policy, options);
  return {
    ...evaluation,
    inputPath,
    policyKind: policy?.kind ?? null,
    policySource: policy?.source ?? null,
    files: byFile.size,
    samples: loaded.length,
    positiveDistance: options.positiveDistance ?? 0.04,
    outcomeHorizon: Math.max(1, Math.trunc(options.outcomeHorizon ?? 2)),
    minOutcomeOwnedCellGrowth: options.minOutcomeOwnedCellGrowth ?? 1,
    outcomes: outcomeStats,
  };
}

export async function collectObservationSamples(inputPath = "artifacts") {
  const files = await findObservationSampleFiles(inputPath);
  const samples = [];

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    for (const line of text.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      samples.push({ file, sample: JSON.parse(trimmed) });
    }
  }

  return samples;
}

export async function trainPolicyFromObservationArtifacts(inputPath = "artifacts", options = {}) {
  const loaded = await collectObservationSamples(inputPath);
  const examples = buildObservationTrainingExamples(loaded.map((entry) => entry.sample), options);
  const policy = trainLinearPolicy(examples, options);
  return {
    ...policy,
    inputPath,
    source: "action-labeled-observations",
    training: {
      ...policy.training,
      files: new Set(loaded.map((entry) => entry.file)).size,
      samples: loaded.length,
      examples: examples.length,
      positives: examples.filter((example) => example.label === 1).length,
      matchedClicks: new Set(examples.map((example) => example.decisionId)).size,
    },
  };
}

export async function evaluatePolicyOnObservationArtifacts(inputPath = "artifacts", policy, options = {}) {
  const loaded = await collectObservationSamples(inputPath);
  const examples = buildObservationTrainingExamples(loaded.map((entry) => entry.sample), options);
  const evaluation = evaluatePolicyExamples(examples, policy, options);
  return {
    ...evaluation,
    inputPath,
    policyKind: policy?.kind ?? null,
    policySource: policy?.source ?? null,
    files: new Set(loaded.map((entry) => entry.file)).size,
    samples: loaded.length,
    positiveDistance: options.positiveDistance ?? 0.04,
  };
}

export function buildTrainingExamples(samples = [], options = {}) {
  const positiveDistance = options.positiveDistance ?? 0.04;
  const examples = [];

  for (const [decisionIndex, sample] of samples.entries()) {
    const actionTarget = actionPoint(sample.action);
    if (!actionTarget) continue;
    const candidates = candidateFeaturesForSample(sample);
    if (!candidates.length) continue;

    const nearest = candidates
      .map((candidate) => ({
        ...candidate,
        distanceToAction: pointDistance(candidate.target, actionTarget),
      }))
      .toSorted((a, b) => a.distanceToAction - b.distanceToAction)[0];
    if (!nearest || nearest.distanceToAction > positiveDistance) continue;

    for (const candidate of candidates) {
      const distance = pointDistance(candidate.target, actionTarget);
      examples.push({
        decisionId: decisionIndex,
        label: distance <= positiveDistance ? 1 : 0,
        target: candidate.target,
        source: candidate.source ?? "unknown",
        features: policyFeatures(candidate, sample),
      });
    }
  }

  return examples;
}

export function buildOutcomeTrainingExamples(samples = [], options = {}) {
  return buildOutcomeTrainingSet(samples, options).examples;
}

export function buildOutcomeTrainingSet(samples = [], options = {}) {
  const positiveDistance = options.positiveDistance ?? 0.04;
  const horizon = Math.max(1, Math.trunc(options.outcomeHorizon ?? 2));
  const minGrowth = options.minOutcomeOwnedCellGrowth ?? 1;
  const examples = [];
  const outcomes = emptyOutcomeStats({ outcomeHorizon: horizon, minOutcomeOwnedCellGrowth: minGrowth });

  for (const [decisionIndex, sample] of samples.entries()) {
    const actionTarget = actionPoint(sample.action);
    if (!actionTarget) continue;
    outcomes.actionDecisions += 1;

    const candidates = candidateFeaturesForSample(sample);
    if (!candidates.length) {
      outcomes.skippedNoCandidates += 1;
      continue;
    }

    const nearest = candidates
      .map((candidate) => ({
        ...candidate,
        distanceToAction: pointDistance(candidate.target, actionTarget),
      }))
      .toSorted((a, b) => a.distanceToAction - b.distanceToAction)[0];
    if (!nearest || nearest.distanceToAction > positiveDistance) {
      outcomes.unmatchedActions += 1;
      continue;
    }
    outcomes.matchedActions += 1;

    const outcome = decisionOutcome(samples, decisionIndex, horizon);
    if (!outcome.hasOutcome) {
      outcomes.skippedNoOutcome += 1;
      continue;
    }
    outcomes.outcomeDecisions += 1;
    outcomes.totalOwnedCellGrowth += outcome.ownedCellGrowth;
    outcomes.maxOwnedCellGrowth = Math.max(outcomes.maxOwnedCellGrowth, outcome.ownedCellGrowth);

    if (outcome.ownedCellGrowth < minGrowth) {
      outcomes.unsuccessfulActions += 1;
      continue;
    }
    outcomes.successfulActions += 1;

    for (const candidate of candidates) {
      const distance = pointDistance(candidate.target, actionTarget);
      examples.push({
        decisionId: decisionIndex,
        label: distance <= positiveDistance ? 1 : 0,
        target: candidate.target,
        source: candidate.source ?? "unknown",
        features: policyFeatures(candidate, sample),
        outcome: {
          ownedCellGrowth: outcome.ownedCellGrowth,
          horizon,
        },
      });
    }
  }

  outcomes.meanOwnedCellGrowth = ratio(outcomes.totalOwnedCellGrowth, outcomes.outcomeDecisions);
  if (outcomes.maxOwnedCellGrowth === -Infinity) outcomes.maxOwnedCellGrowth = null;
  return { examples, outcomes };
}

export function buildObservationTrainingExamples(samples = [], options = {}) {
  const positiveDistance = options.positiveDistance ?? 0.04;
  const examples = [];
  let decisionIndex = 0;

  for (const sample of samples) {
    const candidates = observationCandidateFeatures(sample);
    if (!candidates.length) continue;

    for (const actionTarget of observationActionPoints(sample)) {
      const nearest = candidates
        .map((candidate) => ({
          ...candidate,
          distanceToAction: pointDistance(candidate.target, actionTarget),
        }))
        .toSorted((a, b) => a.distanceToAction - b.distanceToAction)[0];
      if (!nearest || nearest.distanceToAction > positiveDistance) continue;

      const decisionId = decisionIndex;
      decisionIndex += 1;
      for (const candidate of candidates) {
        const distance = pointDistance(candidate.target, actionTarget);
        examples.push({
          decisionId,
          label: distance <= positiveDistance ? 1 : 0,
          target: candidate.target,
          source: candidate.source ?? "unknown",
          features: policyFeatures(candidate, sample),
        });
      }
    }
  }

  return examples;
}

export function evaluatePolicyExamples(examples = [], policy, options = {}) {
  const groups = groupByDecision(examples);
  const details = [];
  const maxDetails = options.maxDetails ?? 20;
  let top1Hits = 0;
  let top3Hits = 0;
  let rankTotal = 0;
  let reciprocalRankTotal = 0;
  let candidateTotal = 0;

  for (const group of groups) {
    const ranked = group
      .map((example) => ({
        ...example,
        policyScore: dot(policy?.weights ?? {}, example.features),
      }))
      .toSorted((a, b) => b.policyScore - a.policyScore);
    const positiveRanks = ranked
      .map((example, index) => ({ example, rank: index + 1 }))
      .filter((entry) => entry.example.label === 1);
    const bestPositive = positiveRanks.toSorted((a, b) => a.rank - b.rank)[0] ?? null;
    if (!bestPositive) continue;

    const rank = bestPositive.rank;
    if (rank === 1) top1Hits += 1;
    if (rank <= 3) top3Hits += 1;
    rankTotal += rank;
    reciprocalRankTotal += 1 / rank;
    candidateTotal += ranked.length;

    if (details.length < maxDetails) {
      details.push({
        decisionId: bestPositive.example.decisionId,
        bestPositiveRank: rank,
        candidateCount: ranked.length,
        topScore: roundMetric(ranked[0]?.policyScore),
        positiveScore: roundMetric(bestPositive.example.policyScore),
        topTarget: ranked[0]?.target ?? null,
        positiveTarget: bestPositive.example.target ?? null,
        topSource: ranked[0]?.source ?? null,
        positiveSource: bestPositive.example.source ?? null,
      });
    }
  }

  const decisions = groups.length;
  return {
    kind: "policy-ranking-evaluation",
    examples: examples.length,
    decisions,
    positives: examples.filter((example) => example.label === 1).length,
    metrics: {
      top1Accuracy: ratio(top1Hits, decisions),
      top3Accuracy: ratio(top3Hits, decisions),
      meanBestPositiveRank: ratio(rankTotal, decisions),
      meanReciprocalRank: ratio(reciprocalRankTotal, decisions),
      meanCandidateCount: ratio(candidateTotal, decisions),
    },
    hits: {
      top1: top1Hits,
      top3: top3Hits,
    },
    details,
  };
}

export function trainLinearPolicy(examples = [], options = {}) {
  const epochs = options.epochs ?? 12;
  const learningRate = options.learningRate ?? 0.08;
  const margin = options.margin ?? 0.25;
  const weights = Object.fromEntries(policyFeatureNames.map((name) => [name, 0]));
  let updates = 0;

  const groups = groupByDecision(examples);
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const group of groups) {
      const positives = group.filter((example) => example.label === 1);
      const negatives = group.filter((example) => example.label === 0);
      for (const positive of positives) {
        for (const negative of negatives) {
          const diff = dot(weights, positive.features) - dot(weights, negative.features);
          if (diff >= margin) continue;
          addScaled(weights, positive.features, learningRate);
          addScaled(weights, negative.features, -learningRate);
          updates += 1;
        }
      }
    }
  }

  return {
    kind: "territorial-linear-target-ranker",
    version: 1,
    featureNames: policyFeatureNames,
    weights,
    training: {
      examples: examples.length,
      decisions: groups.length,
      epochs,
      learningRate,
      margin,
      updates,
    },
  };
}

export function choosePolicyTarget(candidates = [], sampleContext = {}, policy, options = {}) {
  if (!policy?.weights || !candidates.length) {
    return {
      target: null,
      probe: null,
      probes: candidates,
      reason: "no-policy-target",
    };
  }

  const requireAttackLabel = options.requireAttackLabel ?? false;
  const scored = candidates.map((candidate, index) => {
    const features = policyFeatures(candidate, {
      ...sampleContext,
      maxTargetTroopRatio: options.maxTargetTroopRatio ?? sampleContext.maxTargetTroopRatio,
      maxOpponentTroopRatio: options.maxOpponentTroopRatio ?? sampleContext.maxOpponentTroopRatio,
      maxSelectedAttackRatio: options.maxSelectedAttackRatio ?? sampleContext.maxSelectedAttackRatio,
    });
    const selectedAttackRatio = Number.isFinite(candidate.selectedAttackRatio)
      ? candidate.selectedAttackRatio
      : troopRatio(candidate.selectedAttackTroops, ownTroopsFromContext(sampleContext));
    const troopSafe = labelTroopSafe(candidate, ownTroopsFromContext(sampleContext), options);
    const attackLabelSafe = !requireAttackLabel || Number.isFinite(candidate.selectedAttackTroops);
    const attackCostSafe = selectedAttackSafe(selectedAttackRatio, options);
    return {
      ...candidate,
      index,
      features,
      selectedAttackRatio,
      policyScore: dot(policy.weights, features),
      troopSafe,
      attackCostSafe,
      safe: candidate.safe !== false && attackLabelSafe && troopSafe && attackCostSafe,
    };
  });
  const pool = scored.filter((candidate) => candidate.safe);
  if (!pool.length) {
    return {
      target: null,
      probe: null,
      probes: scored,
      reason: "policy-no-safe-target",
    };
  }

  const best = pool.toSorted((a, b) => b.policyScore - a.policyScore)[0];
  return {
    target: best.target,
    probe: best,
    probes: scored,
    reason: "policy-target",
  };
}

export async function loadPolicy(filePath) {
  const policy = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (policy.kind !== "territorial-linear-target-ranker" || !policy.weights) {
    throw new Error(`Unsupported policy file: ${filePath}`);
  }
  return policy;
}

export async function writePolicy(filePath, policy) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(policy, null, 2)}\n`);
}

function candidateFeaturesForSample(sample) {
  if (sample.targetProbes?.length) return sample.targetProbes;

  const candidates = [];
  for (const region of sample.visual?.neighborRegions ?? []) {
    candidates.push({
      target: region.target,
      source: "neighbor-region",
      visualScore: region.score,
      cellCount: region.cellCount,
      borderCellCount: region.borderCellCount,
      sizeVsOwned: region.sizeVsOwned,
    });
  }
  for (const target of sample.visual?.frontier ?? []) {
    candidates.push({
      target: { x: target.x, y: target.y },
      source: "frontier",
      visualScore: target.score,
    });
  }
  return candidates;
}

export function policyFeatures(candidate, sampleContext = {}) {
  const ownCenter = sampleContext.telemetry?.ownCenter ?? sampleContext.ownCenter ?? sampleContext.visual?.center ?? { x: 0.5, y: 0.5 };
  const labelRelation = candidate.label?.relation ?? null;
  const source = candidate.source ?? "unknown";
  const target = candidate.target ?? { x: ownCenter.x, y: ownCenter.y };
  const ownTroops = ownTroopsFromContext(sampleContext);
  const selectedAttackRatio = Number.isFinite(candidate.selectedAttackRatio)
    ? candidate.selectedAttackRatio
    : troopRatio(candidate.selectedAttackTroops, ownTroops);
  const labelRatio = Number.isFinite(candidate.labelTroopRatio)
    ? candidate.labelTroopRatio
    : troopRatio(candidate.label?.troops, ownTroops);
  const weakTargetRatio = sampleContext.weakTargetTroopRatio ?? 0.45;
  const labelCap = labelTroopCap(candidate, sampleContext);
  const targetTroopSafe = !Number.isFinite(labelRatio) || !Number.isFinite(labelCap) || labelRatio <= labelCap;
  const maxSelectedAttackRatio = sampleContext.maxSelectedAttackRatio ?? 0.34;
  const attackCostSafe = !Number.isFinite(selectedAttackRatio) || selectedAttackRatio <= maxSelectedAttackRatio;

  return {
    bias: 1,
    visualScore: scaleFinite(candidate.visualScore, 10),
    hasSelectedAttack: Number.isFinite(candidate.selectedAttackTroops) || Number.isFinite(candidate.selectedAttackPercent) ? 1 : 0,
    selectedAttackPercent: Number.isFinite(candidate.selectedAttackPercent) ? candidate.selectedAttackPercent : 0,
    selectedAttackRatio: Number.isFinite(selectedAttackRatio) ? selectedAttackRatio : 0,
    attackCostSafe: attackCostSafe ? 1 : 0,
    selectedAttackOverCap: Number.isFinite(selectedAttackRatio)
      ? Math.max(0, selectedAttackRatio - maxSelectedAttackRatio)
      : 0,
    safe: candidate.safe === false || !targetTroopSafe || !attackCostSafe ? 0 : 1,
    cellCountLog: logFeature(candidate.cellCount, 50),
    borderCellCountLog: logFeature(candidate.borderCellCount, 20),
    sizeVsOwned: Number.isFinite(candidate.sizeVsOwned) ? Math.min(2, candidate.sizeVsOwned) : 0,
    sourceMapLabel: source === "map-label" ? 1 : 0,
    sourceNeighborRegion: source === "neighbor-region" ? 1 : 0,
    sourceFrontier: source === "frontier" ? 1 : 0,
    sourceFallback: source === "fallback" ? 1 : 0,
    hasMapLabel: candidate.label ? 1 : 0,
    labelNeutral: labelRelation === "neutral" ? 1 : 0,
    labelOpponent: labelRelation === "opponent" ? 1 : 0,
    labelUnknown: labelRelation === "unknown" ? 1 : 0,
    hasLabelTroops: Number.isFinite(candidate.label?.troops) ? 1 : 0,
    labelTroopRatio: Number.isFinite(labelRatio) ? Math.min(3, labelRatio) : 0,
    labelTroopOverCap: Number.isFinite(labelRatio) && Number.isFinite(labelCap) ? Math.max(0, labelRatio - labelCap) : 0,
    weakLabelTarget: Number.isFinite(labelRatio) && labelRatio <= weakTargetRatio ? 1 : 0,
    distanceFromOwnCenter: pointDistance(target, ownCenter),
  };
}

function groupByDecision(examples) {
  const groupsById = new Map();
  for (const example of examples) {
    const group = groupsById.get(example.decisionId) ?? [];
    group.push(example);
    groupsById.set(example.decisionId, group);
  }
  return Array.from(groupsById.values())
    .filter((group) => group.some((example) => example.label === 1) && group.some((example) => example.label === 0));
}

function groupDecisionSamplesByFile(loaded) {
  const byFile = new Map();
  for (const entry of loaded) {
    const group = byFile.get(entry.file) ?? [];
    group.push(entry.sample);
    byFile.set(entry.file, group);
  }
  return byFile;
}

function actionPoint(action) {
  if (!action || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return null;
  if (!["click", "attackClick"].includes(action.type)) return null;
  return { x: action.x, y: action.y };
}

function decisionOutcome(samples, decisionIndex, horizon) {
  const initialOwnedCellCount = samples[decisionIndex]?.visual?.ownedCellCount;
  if (!Number.isFinite(initialOwnedCellCount)) return { hasOutcome: false, ownedCellGrowth: null };

  let maxFutureOwnedCellCount = null;
  const lastIndex = Math.min(samples.length - 1, decisionIndex + horizon);
  for (let index = decisionIndex + 1; index <= lastIndex; index += 1) {
    const futureOwnedCellCount = samples[index]?.visual?.ownedCellCount;
    if (!Number.isFinite(futureOwnedCellCount)) continue;
    maxFutureOwnedCellCount = maxFutureOwnedCellCount === null
      ? futureOwnedCellCount
      : Math.max(maxFutureOwnedCellCount, futureOwnedCellCount);
  }

  if (maxFutureOwnedCellCount === null) return { hasOutcome: false, ownedCellGrowth: null };
  return {
    hasOutcome: true,
    ownedCellGrowth: maxFutureOwnedCellCount - initialOwnedCellCount,
  };
}

function emptyOutcomeStats(options = {}) {
  return {
    horizon: Math.max(1, Math.trunc(options.outcomeHorizon ?? 2)),
    minOwnedCellGrowth: options.minOutcomeOwnedCellGrowth ?? 1,
    actionDecisions: 0,
    matchedActions: 0,
    outcomeDecisions: 0,
    successfulActions: 0,
    unsuccessfulActions: 0,
    unmatchedActions: 0,
    skippedNoCandidates: 0,
    skippedNoOutcome: 0,
    totalOwnedCellGrowth: 0,
    meanOwnedCellGrowth: null,
    maxOwnedCellGrowth: -Infinity,
  };
}

function mergeOutcomeStats(target, source) {
  for (const key of [
    "actionDecisions",
    "matchedActions",
    "outcomeDecisions",
    "successfulActions",
    "unsuccessfulActions",
    "unmatchedActions",
    "skippedNoCandidates",
    "skippedNoOutcome",
    "totalOwnedCellGrowth",
  ]) {
    target[key] += source[key] ?? 0;
  }
  if (Number.isFinite(source.maxOwnedCellGrowth)) {
    target.maxOwnedCellGrowth = Number.isFinite(target.maxOwnedCellGrowth)
      ? Math.max(target.maxOwnedCellGrowth, source.maxOwnedCellGrowth)
      : source.maxOwnedCellGrowth;
  }
  target.meanOwnedCellGrowth = ratio(target.totalOwnedCellGrowth, target.outcomeDecisions);
  if (target.maxOwnedCellGrowth === -Infinity) target.maxOwnedCellGrowth = null;
}

function finalizeOutcomeStats(outcomes) {
  outcomes.meanOwnedCellGrowth = ratio(outcomes.totalOwnedCellGrowth, outcomes.outcomeDecisions);
  if (outcomes.maxOwnedCellGrowth === -Infinity) outcomes.maxOwnedCellGrowth = null;
  return outcomes;
}

function addScaled(weights, features, scale) {
  for (const name of policyFeatureNames) {
    weights[name] = (weights[name] ?? 0) + (features[name] ?? 0) * scale;
  }
}

function dot(weights, features) {
  let total = 0;
  for (const name of policyFeatureNames) {
    total += (weights[name] ?? 0) * (features[name] ?? 0);
  }
  return total;
}

async function findDecisionSampleFiles(inputPath) {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) {
    if (path.basename(inputPath) !== "decision-samples.ndjson") {
      throw new Error(`Expected a decision-samples.ndjson file or directory, got ${inputPath}`);
    }
    return [inputPath];
  }

  const files = [];
  await walk(inputPath, files);
  return files.toSorted();
}

async function findObservationSampleFiles(inputPath) {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) {
    if (path.basename(inputPath) !== "observations.ndjson") {
      throw new Error(`Expected an observations.ndjson file or directory, got ${inputPath}`);
    }
    return [inputPath];
  }

  const files = [];
  await walkForFile(inputPath, files, "observations.ndjson");
  return files.toSorted();
}

async function walk(dir, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, files);
    } else if (entry.isFile() && entry.name === "decision-samples.ndjson") {
      files.push(entryPath);
    }
  }
}

async function walkForFile(dir, files, fileName) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkForFile(entryPath, files, fileName);
    } else if (entry.isFile() && entry.name === fileName) {
      files.push(entryPath);
    }
  }
}

function observationActionPoints(sample) {
  const actions = sample.actions ?? [];
  const clicks = actions
    .filter((action) => action.type === "click")
    .filter((action) => action.canvas?.inside)
    .map((action) => ({
      x: action.canvas.x,
      y: action.canvas.y,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  return dedupePoints(clicks);
}

function observationCandidateFeatures(sample) {
  const candidates = [];
  const ownCenter = sample.telemetry?.ownCenter ?? sample.visual?.center ?? { x: 0.5, y: 0.5 };

  for (const label of sample.telemetry?.mapLabels ?? []) {
    if (label.relation === "own") continue;
    if (!Number.isFinite(label.x) || !Number.isFinite(label.y)) continue;
    candidates.push({
      target: { x: label.x, y: label.y },
      source: "map-label",
      visualScore: observationLabelScore(label, ownCenter),
      cellCount: null,
      borderCellCount: null,
      label: {
        name: label.name,
        troops: Number.isFinite(label.troops) ? label.troops : null,
        relation: label.relation ?? "unknown",
        x: label.x,
        y: label.y,
      },
    });
  }

  for (const region of sample.visual?.neighborRegions ?? []) {
    candidates.push({
      target: region.target,
      source: "neighbor-region",
      visualScore: region.score,
      cellCount: region.cellCount,
      borderCellCount: region.borderCellCount,
      sizeVsOwned: region.sizeVsOwned,
    });
  }

  for (const target of sample.visual?.frontier ?? []) {
    candidates.push({
      target: { x: target.x, y: target.y },
      source: "frontier",
      visualScore: target.score,
      cellCount: null,
      borderCellCount: null,
    });
  }

  if (sample.visual?.recommendedTarget) {
    candidates.push({
      target: sample.visual.recommendedTarget,
      source: "frontier",
      visualScore: 0,
    });
  }

  if (sample.visual?.recommendedRegionTarget) {
    candidates.push({
      target: sample.visual.recommendedRegionTarget,
      source: "neighbor-region",
      visualScore: 0,
    });
  }

  return dedupeCandidates(candidates);
}

function observationLabelScore(label, ownCenter) {
  const relationBonus = label.relation === "neutral" ? 2 : 1;
  const troopScore = Number.isFinite(label.troops) ? 1 / Math.log10(Math.max(10, label.troops)) : 0.1;
  return 25 + relationBonus + troopScore + Math.max(0, 1 - pointDistance(label, ownCenter) / 0.35);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.target?.x) || !Number.isFinite(candidate.target?.y)) continue;
    const key = `${candidate.target.x.toFixed(4)}:${candidate.target.y.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function dedupePoints(points) {
  const seen = new Set();
  const unique = [];
  for (const point of points) {
    const key = `${point.x.toFixed(4)}:${point.y.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  return unique;
}

function scaleFinite(value, denominator) {
  return Number.isFinite(value) ? value / denominator : 0;
}

function logFeature(value, denominator) {
  return Number.isFinite(value) ? Math.log1p(Math.max(0, value)) / Math.log1p(denominator) : 0;
}

function troopRatio(selectedAttackTroops, ownTroops) {
  if (!Number.isFinite(selectedAttackTroops) || !Number.isFinite(ownTroops) || ownTroops <= 0) return null;
  return selectedAttackTroops / ownTroops;
}

function ownTroopsFromContext(sampleContext) {
  return sampleContext.telemetry?.visibleTroops
    ?? sampleContext.telemetry?.ownVisibleTroops
    ?? sampleContext.ownVisibleTroops;
}

function labelTroopSafe(candidate, ownTroops, options = {}) {
  const ratio = Number.isFinite(candidate.labelTroopRatio)
    ? candidate.labelTroopRatio
    : troopRatio(candidate.label?.troops, ownTroops);
  const cap = labelTroopCap(candidate, options);
  return !Number.isFinite(ratio) || !Number.isFinite(cap) || ratio <= cap;
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

function pointDistance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function ratio(numerator, denominator) {
  if (!denominator) return null;
  return roundMetric(numerator / denominator);
}

function roundMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : null;
}
