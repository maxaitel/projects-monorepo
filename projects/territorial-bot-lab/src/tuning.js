import { summarizePlacement } from "./telemetry.js";

const tuneDimensions = [
  {
    key: "openingPercent",
    flag: "opening-percent",
    listFlag: "opening-percent-list",
    defaultValues: [0.39, 0.415],
    parse: numberListFlag,
    label: (value) => `p${labelValue(value)}`,
  },
  {
    key: "maxExpansionClicks",
    flag: "max-expansion-clicks",
    listFlag: "expansion-clicks-list",
    defaultValues: [5, 8],
    parse: integerListFlag,
    label: (value) => `n${value}`,
  },
  {
    key: "spawn",
    flag: null,
    listFlag: "spawn-list",
    defaultValues: [null],
    parse: spawnListFlag,
    label: (value) => `spawn${labelValue(value.x)}x${labelValue(value.y)}`,
    toFlags: (value) => ({
      "spawn-x": String(value.x),
      "spawn-y": String(value.y),
    }),
  },
  {
    key: "minInterest",
    flag: "min-interest",
    listFlag: "min-interest-list",
    defaultValues: [null],
    parse: optionalNumberListFlag,
    label: (value) => `min${labelValue(value)}`,
  },
  {
    key: "resumeInterest",
    flag: "resume-interest",
    listFlag: "resume-interest-list",
    defaultValues: [null],
    parse: optionalNumberListFlag,
    label: (value) => `resume${labelValue(value)}`,
  },
  {
    key: "midgameStartSeconds",
    flag: "midgame-start-seconds",
    listFlag: "midgame-start-seconds-list",
    defaultValues: [null],
    parse: optionalIntegerListFlag,
    label: (value) => `mid${value}`,
  },
  {
    key: "maxSelectedAttackRatio",
    flag: "max-selected-attack-ratio",
    listFlag: "max-selected-attack-ratio-list",
    defaultValues: [null],
    parse: optionalNumberListFlag,
    label: (value) => `cost${labelValue(value)}`,
  },
  {
    key: "maxOpponentTroopRatio",
    flag: "max-opponent-troop-ratio",
    listFlag: "max-opponent-troop-ratio-list",
    defaultValues: [null],
    parse: optionalNumberListFlag,
    label: (value) => `opp${labelValue(value)}`,
  },
  {
    key: "lowAttackSlider",
    flag: "low-attack-slider",
    listFlag: "low-attack-slider-list",
    defaultValues: [null],
    parse: optionalNumberListFlag,
    label: (value) => `low${labelValue(value)}`,
  },
  {
    key: "targetProbeCount",
    flag: "target-probe-count",
    listFlag: "target-probe-count-list",
    defaultValues: [null],
    parse: optionalIntegerListFlag,
    label: (value) => `probe${value}`,
  },
  {
    key: "reprobeLowAttackOnUnsafeCost",
    flag: "reprobe-low-attack-on-unsafe-cost",
    listFlag: "reprobe-low-attack-on-unsafe-cost-list",
    defaultValues: [null],
    parse: optionalBooleanListFlag,
    label: (value) => `reprobe${value ? "on" : "off"}`,
  },
];

export function buildTuneConfigs(flags = {}) {
  const dimensions = tuneDimensions.map((dimension) => ({
    ...dimension,
    values: dimension.parse(
      flags[dimension.listFlag],
      dimension.flag ? flags[dimension.flag] : undefined,
      dimension.defaultValues,
      flags,
    ),
  }));
  return crossProduct(dimensions);
}

export function tuneConfigToFlags(config = {}) {
  const flags = {};
  for (const dimension of tuneDimensions) {
    const value = config[dimension.key];
    if (value === null || value === undefined) continue;
    if (dimension.toFlags) {
      Object.assign(flags, dimension.toFlags(value));
    } else {
      flags[dimension.flag] = String(value);
    }
  }
  return flags;
}

export function formatTuneConfigLabel(config = {}) {
  return tuneDimensions
    .filter((dimension) => config[dimension.key] !== null && config[dimension.key] !== undefined)
    .map((dimension) => dimension.label(config[dimension.key]))
    .join("-");
}

export function rankTuneResults(results, options = {}) {
  return rankTuneResultsByObjective(results, options);
}

export function rankTuneResultsByObjective(results, options = {}) {
  const objective = normalizeTuneObjective(options.objective);
  return results.toSorted((a, b) => compareTuneResults(a, b, objective));
}

export function rankEvaluationGames(games, options = {}) {
  const objective = normalizeTuneObjective(options.objective);
  return games.toSorted((a, b) => compareTuneResults(gameMetrics(a), gameMetrics(b), objective));
}

export function normalizeTuneObjective(value = "score") {
  const objective = String(value ?? "score").trim().toLowerCase();
  if (["score", "placement", "rank"].includes(objective)) return objective;
  throw new Error(`Unknown tune objective: ${value}. Use score, placement, or rank.`);
}

export function summarizeTuneGames(games = []) {
  const scores = [];
  const placementPercentiles = [];
  const ranks = [];
  const top10 = [];
  const top25 = [];
  const top50 = [];

  for (const game of games) {
    if (Number.isFinite(game.score)) scores.push(game.score);
    const placement = placementForGame(game);
    if (Number.isFinite(placement.percentile)) placementPercentiles.push(placement.percentile);
    if (Number.isFinite(placement.rank)) ranks.push(placement.rank);
    if (placement.top10 !== null) top10.push(placement.top10 ? 1 : 0);
    if (placement.top25 !== null) top25.push(placement.top25 ? 1 : 0);
    if (placement.top50 !== null) top50.push(placement.top50 ? 1 : 0);
  }

  return {
    meanScore: roundedMean(scores),
    bestScore: roundedMax(scores),
    worstScore: roundedMin(scores),
    meanPlacementPercentile: roundedMean(placementPercentiles),
    bestPlacementPercentile: roundedMax(placementPercentiles),
    meanRank: roundedMean(ranks),
    bestRank: roundedMin(ranks),
    top10Rate: roundedMean(top10),
    top25Rate: roundedMean(top25),
    top50Rate: roundedMean(top50),
  };
}

function crossProduct(dimensions) {
  let configs = [{}];
  for (const dimension of dimensions) {
    const next = [];
    for (const config of configs) {
      for (const value of dimension.values) {
        next.push(value === null || value === undefined
          ? { ...config }
          : {
              ...config,
              [dimension.key]: value,
            });
      }
    }
    configs = next;
  }
  return configs;
}

function numberListFlag(listValue, scalarValue, defaultValues) {
  return listValue === undefined
    ? defaultValues
    : parseNumberCsv(listValue);
}

function integerListFlag(listValue, scalarValue, defaultValues) {
  return numberListFlag(listValue, scalarValue, defaultValues).map((value) => Math.trunc(value));
}

function optionalNumberListFlag(listValue, scalarValue, defaultValues) {
  if (listValue !== undefined) return parseNumberCsv(listValue);
  if (scalarValue !== undefined) {
    const value = Number.parseFloat(String(scalarValue));
    return Number.isFinite(value) ? [value] : defaultValues;
  }
  return defaultValues;
}

function optionalIntegerListFlag(listValue, scalarValue, defaultValues) {
  return optionalNumberListFlag(listValue, scalarValue, defaultValues).map((value) =>
    value === null ? null : Math.trunc(value),
  );
}

function optionalBooleanListFlag(listValue, scalarValue, defaultValues) {
  if (listValue !== undefined) return parseBooleanCsv(listValue);
  if (scalarValue !== undefined) return [parseBoolean(scalarValue)];
  return defaultValues;
}

function spawnListFlag(listValue, scalarValue, defaultValues, flags = {}) {
  if (listValue !== undefined) return parseSpawnList(listValue);
  if (flags["spawn-x"] !== undefined || flags["spawn-y"] !== undefined) {
    return [parseSpawnPoint(flags["spawn-x"], flags["spawn-y"])];
  }
  return defaultValues;
}

function parseNumberCsv(value) {
  return String(value)
    .split(",")
    .map((item) => Number.parseFloat(item.trim()))
    .filter((value) => Number.isFinite(value));
}

function parseBooleanCsv(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseBoolean);
}

function parseBoolean(value) {
  if (value === true) return true;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function parseSpawnList(value) {
  const pairs = String(value)
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseSpawnPair);
  if (!pairs.length) {
    throw new Error("--spawn-list must include at least one normalized x:y pair.");
  }
  return pairs;
}

function parseSpawnPair(value) {
  const match = String(value).match(/^\s*([+-]?\d*\.?\d+)\s*[:x/]\s*([+-]?\d*\.?\d+)\s*$/i);
  if (!match) {
    throw new Error(`Invalid spawn pair "${value}". Use normalized x:y pairs like 0.63:0.78.`);
  }
  return parseSpawnPoint(match[1], match[2]);
}

function parseSpawnPoint(xValue, yValue) {
  const x = Number.parseFloat(String(xValue));
  const y = Number.parseFloat(String(yValue));
  if (!normalizedCoordinate(x) || !normalizedCoordinate(y)) {
    throw new Error("Spawn coordinates must be normalized finite values between 0 and 1.");
  }
  return { x, y };
}

function normalizedCoordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function labelValue(value) {
  return String(value).replaceAll(".", "_");
}

function compareTuneResults(a, b, objective) {
  const comparisons = objective === "rank"
    ? [
        compareFiniteAscending(a.meanRank, b.meanRank),
        compareFiniteDescending(a.meanPlacementPercentile, b.meanPlacementPercentile),
        compareFiniteDescending(a.meanScore, b.meanScore),
      ]
    : objective === "placement"
      ? [
          compareFiniteDescending(a.meanPlacementPercentile, b.meanPlacementPercentile),
          compareFiniteDescending(a.top10Rate, b.top10Rate),
          compareFiniteAscending(a.meanRank, b.meanRank),
          compareFiniteDescending(a.meanScore, b.meanScore),
        ]
      : [
          compareFiniteDescending(a.meanScore, b.meanScore),
          compareFiniteDescending(a.meanPlacementPercentile, b.meanPlacementPercentile),
          compareFiniteAscending(a.meanRank, b.meanRank),
        ];
  return comparisons.find((value) => value !== 0) ?? String(a.label ?? "").localeCompare(String(b.label ?? ""));
}

function gameMetrics(game = {}) {
  const placement = placementForGame(game);
  return {
    label: String(game.game ?? ""),
    meanScore: game.score,
    meanPlacementPercentile: placement.percentile,
    meanRank: placement.rank,
    top10Rate: placement.top10 === null ? null : placement.top10 ? 1 : 0,
  };
}

function placementForGame(game = {}) {
  return game.placement ?? summarizePlacement(game.finalTelemetry ?? game.runSummary?.finalTelemetry ?? {});
}

function compareFiniteDescending(left, right) {
  const leftFinite = Number.isFinite(left);
  const rightFinite = Number.isFinite(right);
  if (leftFinite && rightFinite) return right - left;
  if (leftFinite) return -1;
  if (rightFinite) return 1;
  return 0;
}

function compareFiniteAscending(left, right) {
  const leftFinite = Number.isFinite(left);
  const rightFinite = Number.isFinite(right);
  if (leftFinite && rightFinite) return left - right;
  if (leftFinite) return -1;
  if (rightFinite) return 1;
  return 0;
}

function roundedMean(values) {
  if (!values.length) return null;
  return roundMetric(values.reduce((total, value) => total + value, 0) / values.length);
}

function roundedMax(values) {
  if (!values.length) return null;
  return roundMetric(Math.max(...values));
}

function roundedMin(values) {
  if (!values.length) return null;
  return roundMetric(Math.min(...values));
}

function roundMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : null;
}
