#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHarness } from "./harness.js";
import {
  AdaptiveCustomScenarioStrategy,
  CustomScenarioOpeningStrategy,
  executeAction,
  ScoutStrategy,
  StrategyContext,
} from "./strategy.js";
import { extractTelemetry, scoreTelemetry, summarizePlacement, summarizeTelemetry } from "./telemetry.js";
import { summarizeBotRun } from "./run-summary.js";
import { analyzeArtifacts } from "./analysis.js";
import {
  evaluatePolicyOnOutcomeArtifacts,
  evaluatePolicyOnObservationArtifacts,
  loadPolicy,
  trainOutcomePolicyFromArtifacts,
  trainPolicyFromArtifacts,
  trainPolicyFromObservationArtifacts,
  writePolicy,
} from "./policy.js";
import { lobbyRouteSteps, runLobbyProbe, runLobbyWatch } from "./lobby.js";
import { runObservationRecorder } from "./observation.js";
import {
  buildBestTuneProfile,
  loadConfigProfile,
  mergeConfigFlags,
} from "./config-profile.js";
import {
  buildTuneConfigs,
  formatTuneConfigLabel,
  normalizeTuneObjective,
  rankEvaluationGames,
  rankTuneResults,
  summarizeTuneGames,
  tuneConfigToFlags,
} from "./tuning.js";

const commands = new Set([
  "probe",
  "record",
  "bot",
  "evaluate",
  "tune",
  "analyze",
  "train-policy",
  "train-outcome-policy",
  "train-action-policy",
  "evaluate-outcome-policy",
  "evaluate-action-policy",
  "lobby-probe",
  "lobby-watch",
  "help",
]);

export function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const flags = { _: [] };
  if (command === "--help" || command === "-h") return { command: "help", flags };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "-h") {
      flags.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return { command, flags };
}

function boolFlag(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  if (value === true) return true;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function intFlag(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return parsed;
}

function floatFlag(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return defaultValue;
  return parsed;
}

function optionalFloatFlag(value) {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function usage() {
  return `Territorial Bot Lab

Usage:
  npm run probe -- [flags]
  npm run record -- [flags]
  npm run bot -- [flags]
  npm run evaluate -- [flags]
  npm run tune -- [flags]
  npm run analyze -- [flags]
  npm run train-policy -- [flags]
  npm run train-outcome-policy -- [flags]
  npm run train-action-policy -- [flags]
  npm run evaluate-outcome-policy -- [flags]
  npm run evaluate-action-policy -- [flags]
  npm run lobby-probe -- [flags]
  npm run lobby-watch -- [flags]
  npx ttbot probe [flags]

Commands:
  probe   Launch the real Territorial.io client, inject canvas instrumentation, and save artifacts.
  record  Passively record real-client telemetry and compact visual observations for local datasets.
  bot     Run a local UI-control bot loop. Public multiplayer control is intentionally not implemented.
  evaluate
          Run repeated local custom-scenario games and write a summary.
  tune    Run a small real-client parameter sweep and rank configurations.
  analyze Aggregate existing run artifacts into a compact tuning summary.
  train-policy
          Fit a small local target-ranker from decision-samples.ndjson artifacts.
  train-outcome-policy
          Fit a target-ranker from bot decisions that led to sampled territory growth.
  train-action-policy
          Fit a target-ranker from action-labeled observations.ndjson recordings.
  evaluate-outcome-policy
          Rank held-out outcome-labeled bot decisions with a policy and report offline metrics.
  evaluate-action-policy
          Rank held-out action-labeled observations with a policy and report offline metrics.
  lobby-probe
          Capture real-client menu/lobby route artifacts without public gameplay control.
  lobby-watch
          Enter a lobby route and watch for named friends/minimum players without clicking Ready.

Common flags:
  --config <file>         Load bot/evaluate/tune flags from a local JSON profile. CLI flags override it.
  --url <url>             Game URL. Default: https://territorial.io/
  --headless              Run Chromium headless. Default: false
  --duration-ms <ms>      Probe/bot duration. Default: 10000 for probe, 30000 for bot
  --out <dir>             Artifact directory. Default: artifacts/<command>-<timestamp>
  --tick-ms <ms>          Bot loop interval. Default: 1000
  --visual-cols <n>       Canvas sample grid columns for bot/record. Default: 80
  --visual-rows <n>       Canvas sample grid rows for bot/record. Default: 50
  --include-grid          record: include raw sampled RGBA grid in observations.ndjson. Default: false
  --label-actions         record: include local UI click/pointer/key labels in observations. Default: false
  --include-pointer-moves record: include pointermove labels when --label-actions is enabled. Default: false
  --screenshot-every <n>  record: save page/canvas screenshots every n samples. Default: 0
  --mode <mode>           scout, custom-scenario, or custom-adaptive. Default: custom-adaptive
  --opening-percent <x>   Normalized bottom slider x-coordinate. Default: 0.415
  --midgame-percent <x>   Optional normalized slider x-coordinate before post-opening attacks.
  --spawn-x <x>           Normalized custom-map spawn x-coordinate. Default: 0.63
  --spawn-y <y>           Normalized custom-map spawn y-coordinate. Default: 0.78
  --games <n>             Evaluation game count. Default: 3
  --input <dir>           Analyze artifact directory or run-summary.json. Default: artifacts
  --policy <file>         Use a trained local target-ranker for post-opening target choice.
                          Required for evaluate-outcome-policy/evaluate-action-policy.
  --policy-candidate-count <n>
                          Candidate count scored by --policy. Default: target probe count or 5
  --route <name>          Lobby route: main, multiplayer, game-menu, join-lobby-2.
                          Default: game-menu for lobby-probe, join-lobby-2 for lobby-watch
  --step-wait-ms <ms>     lobby-probe/lobby-watch wait after each route click. Default: 1000
  --watch-ms <ms>         lobby-watch duration after entering the route. Default: 10000
  --watch-tick-ms <ms>    lobby-watch polling interval. Default: 1000
  --expected-player <csv> lobby-watch friend/player names that must be visible before readiness is met.
  --min-players <n>       lobby-watch minimum visible lobby player count. Default: 0
  --player-name <name>    Set the real client player name before bot/lobby commands start.
  --opening-percent-list <csv>
                          Tune opening percentages. Default: 0.39,0.415
  --expansion-clicks-list <csv>
                          Tune expansion budgets. Default: 5,8
  --spawn-list <pairs>    Tune custom-map spawn points as normalized x:y pairs, comma-separated.
                          Default: current --spawn-x/--spawn-y or the built-in spawn.
  --min-interest-list <csv>
                          Tune low-interest pause thresholds. Default: current --min-interest
  --resume-interest-list <csv>
                          Tune post-opening resume thresholds. Default: current --resume-interest
  --midgame-start-seconds-list <csv>
                          Tune earliest post-opening attack seconds. Default: current --midgame-start-seconds
  --max-selected-attack-ratio-list <csv>
                          Tune selected attack cost caps. Default: current --max-selected-attack-ratio
  --max-opponent-troop-ratio-list <csv>
                          Tune labeled unknown/opponent target troop caps. Default: current --max-opponent-troop-ratio
  --low-attack-slider-list <csv>
                          Tune conservative attack slider positions. Default: current --low-attack-slider
  --target-probe-count-list <csv>
                          Tune hover probe candidate counts. Default: current --target-probe-count
  --reprobe-low-attack-on-unsafe-cost-list <csv>
                          Tune low-attack reprobe on/off. Values: true,false
  --write-best-config <file>
                          tune: write the best ranked config as a reusable JSON profile.
  --tune-objective <name> Rank tune configs by score, placement, or rank. Default: score
  --min-interest <x>      Pause expansion below this interest ratio. Default: 0.05
  --hard-min-interest <x> Hold expansion below this interest ratio. Default: 0.04
  --resume-interest <x>   Resume post-opening attacks above this ratio. Default: 0.061
  --midgame-start-seconds <n>
                          Earliest second for post-opening region attacks. Default: 12
  --max-expansion-clicks <n>
                          Opening expansion click budget. Default: 8
  --min-attack-troops <n> Hold post-opening region attacks below this visible troop count. Default: 0
  --probe-targets         Hover post-opening target candidates before clicking. Default: false
  --target-probe-count <n>
                          Number of target candidates to hover-probe. Default: 3
  --target-probe-ms <ms>  Wait after each hover probe. Default: 120
  --require-attack-label  Require hover probes to expose selected attack labels before attacking. Default: false
  --hold-unknown-targets  Wait instead of visual fallback when probes do not expose labels. Default: false
  --adaptive-attack-sizing
                          Set the real attack slider per post-opening target. Default: false
  --low-attack-slider <x> Slider x-coordinate for conservative attacks. Default: 0.415
  --normal-attack-slider <x>
                          Slider x-coordinate for normal attacks. Default: --midgame-percent or 0.455
  --high-attack-slider <x>
                          Slider x-coordinate for high-confidence attacks. Default: normal attack slider
  --max-selected-attack-percent <x>
                          Use low slider if hover label exceeds this selected attack percent. Default: 0.34
  --max-selected-attack-ratio <x>
                          Avoid targets whose selected attack troops exceed this own-troop ratio. Default: 0.34
  --reprobe-low-attack-on-unsafe-cost <bool>
                          Lower attack slider and reprobe once when all probes are over attack-cost cap. Default: true
  --recover-attack-slider-after-progress <bool>
                          Restore normal attack slider before probing after sampled territory growth. Default: true
  --max-target-troop-ratio <x>
                          Avoid neutral labeled targets above this target/own troop ratio. Default: 0.85
  --max-opponent-troop-ratio <x>
                          Avoid unknown/opponent labeled targets above this target/own troop ratio. Default: 0.65
  --weak-target-troop-ratio <x>
                          Prefer labeled targets below this target/own troop ratio. Default: 0.45
  --stall-backoff <bool>  Wait after repeated post-opening canvas no-growth ticks. Default: true
  --max-stall-streak <n>  Back off after this many no-growth ticks. Default: 3
  --min-owned-cell-growth <n>
                          Minimum sampled owned-cell gain that counts as progress. Default: 1
  --stall-backoff-ms <ms> Wait duration for territory-stall backoff. Default: 1300
  --failed-target-cooldown <n>
                          Avoid no-growth post-opening targets for this many decisions. Default: 5
  --failed-target-distance <x>
                          Avoid candidate targets within this normalized distance. Default: 0.09
  --min-successful-target-growth <n>
                          Owned-cell gain needed to treat the previous target as productive. Default: 1
  --attack-percent-wait-ms <ms>
                          Wait after adaptive slider changes before clicking. Default: 120
  --max-decision-candidates <n>
                          Candidate count stored per decision sample. Default: 8
  --max-decision-samples <n>
                          Max decision samples retained per run. Default: 10000
  --recovery-wait-ms <ms> Wait duration for low-interest recovery. Default: 900
  --auto-click-center     Let scout strategy click the center when it sees a play-like menu.
  --output <file>         Analyze or policy output file.
  --epochs <n>            train-policy ranking passes. Default: 12
  --learning-rate <x>     train-policy perceptron learning rate. Default: 0.08
  --margin <x>            train-policy ranking margin. Default: 0.25
  --positive-distance <x> train-policy click/candidate match radius. Default: 0.04
                          Also used by train-outcome-policy/evaluate-outcome-policy/train-action-policy/evaluate-action-policy.
  --outcome-horizon <n>   train-outcome-policy look-ahead decision samples. Default: 2
  --min-outcome-owned-cell-growth <n>
                          train-outcome-policy positive growth threshold. Default: 1

Safety:
  This project does not reverse-engineer or send Territorial.io WebSocket gameplay messages.
  It is for local/private experiments against the real browser UI.
`;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function probe(flags) {
  const outDir = String(flags.out || path.join("artifacts", `probe-${timestamp()}`));
  const durationMs = intFlag(flags["duration-ms"], 10000);
  const harness = await createHarness({
    url: String(flags.url || "https://territorial.io/"),
    headless: boolFlag(flags.headless, false),
  });

  try {
    await harness.wait(durationMs);
    const snapshot = await harness.snapshot();
    const telemetry = extractTelemetry(snapshot, { playerName: flags["player-name"] });
    await harness.writeJson(path.join(outDir, "instrumentation.json"), snapshot);
    await harness.writeJson(path.join(outDir, "telemetry.json"), telemetry);
    await harness.screenshot(path.join(outDir, "page.png"));
    await harness.canvasPng(path.join(outDir, "canvas.png"));
    console.log(`Wrote probe artifacts to ${outDir}`);
    console.log(
      `Captured ${snapshot.state.texts.length} text draw calls and ${Object.keys(snapshot.state.drawCounts).length} draw method types.`,
    );
    console.log(`Telemetry: ${JSON.stringify(telemetry)}`);
  } finally {
    await harness.close();
  }
}

async function bot(flags) {
  const outDir = String(flags.out || path.join("artifacts", `bot-${timestamp()}`));
  await runBotSession(flags, { outDir });
}

async function record(flags) {
  const outDir = String(flags.out || path.join("artifacts", `record-${timestamp()}`));
  const harness = await createHarness({
    url: String(flags.url || "https://territorial.io/"),
    headless: boolFlag(flags.headless, false),
  });

  try {
    const summary = await runObservationRecorder(harness, {
      outDir,
      durationMs: intFlag(flags["duration-ms"], 10000),
      tickMs: intFlag(flags["tick-ms"], 1000),
      visualCols: intFlag(flags["visual-cols"], 80),
      visualRows: intFlag(flags["visual-rows"], 50),
      includeGrid: boolFlag(flags["include-grid"], false),
      labelActions: boolFlag(flags["label-actions"], false),
      includePointerMoves: boolFlag(flags["include-pointer-moves"], false),
      screenshotEvery: intFlag(flags["screenshot-every"], 0),
      playerName: flags["player-name"],
    });
    console.log(`Wrote observation artifacts to ${outDir}`);
    console.log(`Observation summary: ${JSON.stringify(summary.samples)}`);
    console.log(`Final telemetry: ${JSON.stringify(summary.finalTelemetry)}`);
  } finally {
    await harness.close();
  }
}

async function evaluate(flags) {
  const games = intFlag(flags.games, 3);
  const outDir = String(flags.out || path.join("artifacts", `evaluate-${timestamp()}`));
  const summary = [];
  await fs.mkdir(outDir, { recursive: true });

  for (let index = 0; index < games; index += 1) {
    const gameOutDir = path.join(outDir, `game-${index + 1}`);
    const result = await runBotSession(flags, {
      outDir: gameOutDir,
      defaultHeadless: true,
      logPrefix: `[${index + 1}/${games}] `,
    });
    summary.push({
      game: index + 1,
      outDir: gameOutDir,
      finalTelemetry: result.telemetry,
      runSummary: result.runSummary,
      score: scoreTelemetry(result.telemetry),
      placement: summarizePlacement(result.telemetry),
      summary: summarizeTelemetry(result.telemetry),
    });
    await fs.writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  }

  const best = summary.toSorted((a, b) => b.score - a.score)[0] ?? null;
  console.log(`Wrote evaluation summary to ${path.join(outDir, "summary.json")}`);
  if (best) {
    console.log(`Best game ${best.game}: score=${best.score.toFixed(6)} telemetry=${JSON.stringify(best.finalTelemetry)}`);
  }
}

async function tune(flags) {
  const outDir = String(flags.out || path.join("artifacts", `tune-${timestamp()}`));
  const objective = normalizeTuneObjective(flags["tune-objective"] ?? "score");
  const configs = buildTuneConfigs(flags);
  const results = [];
  await fs.mkdir(outDir, { recursive: true });

  for (const config of configs) {
    const label = formatTuneConfigLabel(config);
    const configOutDir = path.join(outDir, label);
    const configFlags = {
      ...flags,
      ...tuneConfigToFlags(config),
      out: configOutDir,
    };
    await evaluate(configFlags);
    const summary = JSON.parse(await fs.readFile(path.join(configOutDir, "summary.json"), "utf8"));
    const tuneMetrics = summarizeTuneGames(summary);
    results.push({
      ...config,
      label,
      tuneObjective: objective,
      ...tuneMetrics,
      games: summary.length,
      outDir: configOutDir,
      best: rankEvaluationGames(summary, { objective })[0] ?? null,
    });
    await fs.writeFile(path.join(outDir, "tune-summary.json"), `${JSON.stringify(rankTuneResults(results, { objective }), null, 2)}\n`);
  }

  const ranked = rankTuneResults(results, { objective });
  await fs.writeFile(path.join(outDir, "tune-summary.json"), `${JSON.stringify(ranked, null, 2)}\n`);
  if (flags["write-best-config"] && ranked[0]) {
    const profilePath = String(flags["write-best-config"]);
    const profile = buildBestTuneProfile(ranked[0], {
      sourcePath: path.join(outDir, "tune-summary.json"),
    });
    await fs.mkdir(path.dirname(profilePath), { recursive: true });
    await fs.writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
    console.log(`Wrote best config profile to ${profilePath}`);
  }
  console.log(`Wrote tune summary to ${path.join(outDir, "tune-summary.json")}`);
  if (ranked[0]) {
    console.log(`Best config: ${JSON.stringify(ranked[0])}`);
  }
}

async function analyze(flags) {
  const input = String(flags.input || flags._[0] || "artifacts");
  const summary = await analyzeArtifacts(input);
  const json = `${JSON.stringify(summary, null, 2)}\n`;

  if (flags.output) {
    const outFile = String(flags.output);
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, json);
    console.log(`Analyzed ${summary.runs.total} run(s) from ${input}`);
    console.log(`Wrote analysis summary to ${outFile}`);
    return;
  }

  console.log(json);
}

async function trainPolicy(flags) {
  const input = String(flags.input || flags._[0] || "artifacts");
  const output = String(flags.output || path.join("artifacts", "policies", `policy-${timestamp()}.json`));
  const policy = await trainPolicyFromArtifacts(input, {
    epochs: intFlag(flags.epochs, 12),
    learningRate: floatFlag(flags["learning-rate"], 0.08),
    margin: floatFlag(flags.margin, 0.25),
    positiveDistance: floatFlag(flags["positive-distance"], 0.04),
  });

  if (policy.training.decisions === 0) {
    throw new Error(
      `No trainable target decisions found in ${input}. Run bot/evaluate with decision samples before training a policy.`,
    );
  }

  policy.createdAt = new Date().toISOString();
  await writePolicy(output, policy);
  console.log(`Trained policy from ${policy.training.samples} sample(s), ${policy.training.examples} example(s).`);
  console.log(`Training decisions=${policy.training.decisions} updates=${policy.training.updates}`);
  console.log(`Wrote policy to ${output}`);
}

async function trainOutcomePolicy(flags) {
  const input = String(flags.input || flags._[0] || "artifacts");
  const output = String(flags.output || path.join("artifacts", "policies", `outcome-policy-${timestamp()}.json`));
  const policy = await trainOutcomePolicyFromArtifacts(input, {
    epochs: intFlag(flags.epochs, 12),
    learningRate: floatFlag(flags["learning-rate"], 0.08),
    margin: floatFlag(flags.margin, 0.25),
    positiveDistance: floatFlag(flags["positive-distance"], 0.04),
    outcomeHorizon: intFlag(flags["outcome-horizon"], 2),
    minOutcomeOwnedCellGrowth: intFlag(flags["min-outcome-owned-cell-growth"], 1),
  });

  if (policy.training.decisions === 0) {
    throw new Error(
      `No outcome-positive target decisions found in ${input}. Run bot/evaluate longer or lower --min-outcome-owned-cell-growth.`,
    );
  }

  policy.createdAt = new Date().toISOString();
  await writePolicy(output, policy);
  console.log(`Trained outcome policy from ${policy.training.samples} sample(s), ${policy.training.examples} example(s).`);
  console.log(
    `Matched actions=${policy.training.outcomes.matchedActions} successful=${policy.training.outcomes.successfulActions} updates=${policy.training.updates}`,
  );
  console.log(`Wrote policy to ${output}`);
}

async function trainActionPolicy(flags) {
  const input = String(flags.input || flags._[0] || "artifacts");
  const output = String(flags.output || path.join("artifacts", "policies", `action-policy-${timestamp()}.json`));
  const policy = await trainPolicyFromObservationArtifacts(input, {
    epochs: intFlag(flags.epochs, 12),
    learningRate: floatFlag(flags["learning-rate"], 0.08),
    margin: floatFlag(flags.margin, 0.25),
    positiveDistance: floatFlag(flags["positive-distance"], 0.04),
  });

  if (policy.training.decisions === 0) {
    throw new Error(
      `No trainable action-labeled target decisions found in ${input}. Record with --label-actions and click near visual/map candidates first.`,
    );
  }

  policy.createdAt = new Date().toISOString();
  await writePolicy(output, policy);
  console.log(`Trained action policy from ${policy.training.samples} observation sample(s), ${policy.training.examples} example(s).`);
  console.log(`Matched clicks=${policy.training.matchedClicks} updates=${policy.training.updates}`);
  console.log(`Wrote policy to ${output}`);
}

async function evaluateOutcomePolicy(flags) {
  const input = String(flags.input || flags._[0] || "artifacts");
  if (!flags.policy) {
    throw new Error("--policy is required for evaluate-outcome-policy.");
  }
  const policyPath = String(flags.policy);
  const policy = await loadPolicy(policyPath);
  const evaluation = await evaluatePolicyOnOutcomeArtifacts(input, policy, {
    positiveDistance: floatFlag(flags["positive-distance"], 0.04),
    outcomeHorizon: intFlag(flags["outcome-horizon"], 2),
    minOutcomeOwnedCellGrowth: intFlag(flags["min-outcome-owned-cell-growth"], 1),
  });
  const json = `${JSON.stringify({ policyPath, ...evaluation }, null, 2)}\n`;

  if (flags.output) {
    const outFile = String(flags.output);
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, json);
    console.log(`Evaluated policy ${policyPath} on ${evaluation.decisions} outcome-positive decision(s).`);
    console.log(`top1=${evaluation.metrics.top1Accuracy} top3=${evaluation.metrics.top3Accuracy} mrr=${evaluation.metrics.meanReciprocalRank}`);
    console.log(`Wrote policy evaluation to ${outFile}`);
    return;
  }

  console.log(json);
}

async function evaluateActionPolicy(flags) {
  const input = String(flags.input || flags._[0] || "artifacts");
  if (!flags.policy) {
    throw new Error("--policy is required for evaluate-action-policy.");
  }
  const policyPath = String(flags.policy);
  const policy = await loadPolicy(policyPath);
  const evaluation = await evaluatePolicyOnObservationArtifacts(input, policy, {
    positiveDistance: floatFlag(flags["positive-distance"], 0.04),
  });
  const json = `${JSON.stringify({ policyPath, ...evaluation }, null, 2)}\n`;

  if (flags.output) {
    const outFile = String(flags.output);
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, json);
    console.log(`Evaluated policy ${policyPath} on ${evaluation.decisions} matched decision(s).`);
    console.log(`top1=${evaluation.metrics.top1Accuracy} top3=${evaluation.metrics.top3Accuracy} mrr=${evaluation.metrics.meanReciprocalRank}`);
    console.log(`Wrote policy evaluation to ${outFile}`);
    return;
  }

  console.log(json);
}

async function lobbyProbe(flags) {
  const route = String(flags.route || "game-menu");
  lobbyRouteSteps(route);
  const outDir = String(flags.out || path.join("artifacts", `lobby-probe-${timestamp()}`));
  const harness = await createHarness({
    url: String(flags.url || "https://territorial.io/"),
    headless: boolFlag(flags.headless, false),
  });

  try {
    const summary = await runLobbyProbe(harness, {
      route,
      outDir,
      stepWaitMs: intFlag(flags["step-wait-ms"], 1000),
      finalWaitMs: intFlag(flags["duration-ms"], 6000),
      playerName: flags["player-name"],
    });
    console.log(`Wrote lobby probe artifacts to ${outDir}`);
    console.log(`Route ${route}: ${summary.captures.map((capture) => `${capture.label}:${capture.detectedScreen}`).join(" -> ")}`);
    console.log(`Lobby assessment: ${JSON.stringify(summary.assessment)}`);
  } finally {
    await harness.close();
  }
}

async function lobbyWatch(flags) {
  const route = String(flags.route || "join-lobby-2");
  lobbyRouteSteps(route);
  const outDir = String(flags.out || path.join("artifacts", `lobby-watch-${timestamp()}`));
  const harness = await createHarness({
    url: String(flags.url || "https://territorial.io/"),
    headless: boolFlag(flags.headless, false),
  });

  try {
    const summary = await runLobbyWatch(harness, {
      route,
      outDir,
      stepWaitMs: intFlag(flags["step-wait-ms"], 1000),
      watchMs: intFlag(flags["watch-ms"], 10000),
      watchTickMs: intFlag(flags["watch-tick-ms"], 1000),
      expectedPlayers: stringListFlag(flags["expected-player"], []),
      minPlayers: intFlag(flags["min-players"], 0),
      playerName: flags["player-name"],
    });
    console.log(`Wrote lobby watch artifacts to ${outDir}`);
    console.log(`Route ${route}: ${summary.routeCaptures.map((capture) => `${capture.label}:${capture.detectedScreen}`).join(" -> ")}`);
    console.log(`Lobby watch assessment: ${JSON.stringify(summary.assessment)}`);
  } finally {
    await harness.close();
  }
}

async function runBotSession(flags, options = {}) {
  if (boolFlag(flags["allow-multiplayer-control"], false)) {
    throw new Error(
      "--allow-multiplayer-control is reserved for future private-server work and is not supported by this harness.",
    );
  }

  const outDir = options.outDir ?? String(flags.out || path.join("artifacts", `bot-${timestamp()}`));
  const durationMs = intFlag(flags["duration-ms"], 30000);
  const tickMs = intFlag(flags["tick-ms"], 1000);
  const mode = String(flags.mode || "custom-adaptive");
  const policyPath = flags.policy ? String(flags.policy) : null;
  const policy = policyPath ? await loadPolicy(policyPath) : null;
  const harness = await createHarness({
    url: String(flags.url || "https://territorial.io/"),
    headless: boolFlag(flags.headless, options.defaultHeadless ?? false),
  });
  if (flags["player-name"]) {
    await harness.setPlayerName(String(flags["player-name"]));
  }
  const strategy = makeStrategy(mode);
  const context = new StrategyContext(harness, {
    tickMs,
    autoClickCenter: boolFlag(flags["auto-click-center"], false),
    openingPercent: floatFlag(flags["opening-percent"], 0.415),
    midgamePercent: optionalFloatFlag(flags["midgame-percent"]),
    spawn: parseSpawn(flags),
    visualCols: intFlag(flags["visual-cols"], 80),
    visualRows: intFlag(flags["visual-rows"], 50),
    minInterest: floatFlag(flags["min-interest"], 0.05),
    hardMinInterest: floatFlag(flags["hard-min-interest"], 0.04),
    resumeInterest: floatFlag(flags["resume-interest"], 0.061),
    midgameStartSeconds: intFlag(flags["midgame-start-seconds"], 12),
    maxPauseStreak: intFlag(flags["max-pause-streak"], 2),
    maxExpansionClicks: intFlag(flags["max-expansion-clicks"], 8),
    minAttackTroops: intFlag(flags["min-attack-troops"], 0),
    probeTargets: boolFlag(flags["probe-targets"], false),
    targetProbeCount: intFlag(flags["target-probe-count"], 3),
    targetProbeMs: intFlag(flags["target-probe-ms"], 120),
    requireAttackLabel: boolFlag(flags["require-attack-label"], false),
    holdUnknownTargets: boolFlag(flags["hold-unknown-targets"], false),
    adaptiveAttackSizing: boolFlag(flags["adaptive-attack-sizing"], false),
    lowAttackSlider: floatFlag(flags["low-attack-slider"], 0.415),
    normalAttackSlider: optionalFloatFlag(flags["normal-attack-slider"]),
    highAttackSlider: optionalFloatFlag(flags["high-attack-slider"]),
    maxSelectedAttackPercent: floatFlag(flags["max-selected-attack-percent"], 0.34),
    maxSelectedAttackRatio: floatFlag(flags["max-selected-attack-ratio"], 0.34),
    reprobeLowAttackOnUnsafeCost: boolFlag(flags["reprobe-low-attack-on-unsafe-cost"], true),
    recoverAttackSliderAfterProgress: boolFlag(flags["recover-attack-slider-after-progress"], true),
    maxTargetTroopRatio: floatFlag(flags["max-target-troop-ratio"], 0.85),
    maxOpponentTroopRatio: floatFlag(flags["max-opponent-troop-ratio"], 0.65),
    weakTargetTroopRatio: floatFlag(flags["weak-target-troop-ratio"], 0.45),
    stallBackoff: boolFlag(flags["stall-backoff"], true),
    maxStallStreak: intFlag(flags["max-stall-streak"], 3),
    minOwnedCellGrowth: intFlag(flags["min-owned-cell-growth"], 1),
    stallBackoffMs: intFlag(flags["stall-backoff-ms"], 1300),
    failedTargetCooldown: intFlag(flags["failed-target-cooldown"], 5),
    failedTargetDistance: floatFlag(flags["failed-target-distance"], 0.09),
    minSuccessfulTargetGrowth: intFlag(flags["min-successful-target-growth"], 1),
    attackPercentWaitMs: intFlag(flags["attack-percent-wait-ms"], 120),
    maxDecisionCandidates: intFlag(flags["max-decision-candidates"], 8),
    maxDecisionSamples: intFlag(flags["max-decision-samples"], 10000),
    policy,
    policyPath,
    policyKind: policy?.kind,
    policyCandidateCount: intFlag(flags["policy-candidate-count"], policy ? 5 : undefined),
    playerName: flags["player-name"] ? String(flags["player-name"]) : undefined,
    recoveryWaitMs: intFlag(flags["recovery-wait-ms"], 900),
    holdWaitMs: intFlag(flags["hold-wait-ms"], 1100),
  });
  const log = [];
  const endAt = Date.now() + durationMs;

  try {
    while (Date.now() < endAt) {
      const action = await strategy.nextAction(context);
      const message = await executeAction(context, action);
      log.push({ at: Date.now(), strategy: strategy.name, action, message });
      console.log(`${options.logPrefix ?? ""}${message}`);
    }
    const snapshot = await harness.snapshot();
    const telemetry = extractTelemetry(snapshot, { playerName: flags["player-name"] });
    const grid = await harness.sampleCanvasGrid({ cols: 48, rows: 32 });
    const runSummary = summarizeBotRun({
      log,
      telemetry,
      mode,
      durationMs,
      tickMs,
      options: context.options,
      decisionSamples: context.decisionSamples,
    });
    await fs.mkdir(outDir, { recursive: true });
    await harness.writeJson(path.join(outDir, "bot-log.json"), log);
    await harness.writeJson(path.join(outDir, "final-instrumentation.json"), snapshot);
    await harness.writeJson(path.join(outDir, "final-telemetry.json"), telemetry);
    await harness.writeJson(path.join(outDir, "final-canvas-grid.json"), grid);
    await harness.writeJson(path.join(outDir, "run-summary.json"), runSummary);
    await fs.writeFile(
      path.join(outDir, "decision-samples.ndjson"),
      context.decisionSamples.map((sample) => JSON.stringify(sample)).join("\n") + "\n",
    );
    await harness.screenshot(path.join(outDir, "final-page.png"));
    await harness.canvasPng(path.join(outDir, "final-canvas.png"));
    console.log(`${options.logPrefix ?? ""}Wrote bot artifacts to ${outDir}`);
    console.log(`${options.logPrefix ?? ""}Final telemetry: ${JSON.stringify(telemetry)}`);
    return { outDir, log, telemetry, runSummary };
  } finally {
    await harness.close();
  }
}

function makeStrategy(mode) {
  if (mode === "scout") return new ScoutStrategy();
  if (mode === "custom-scenario") return new CustomScenarioOpeningStrategy();
  if (mode === "custom-adaptive") return new AdaptiveCustomScenarioStrategy();
  throw new Error(`Unknown bot mode: ${mode}`);
}

function stringListFlag(value, defaultValue = []) {
  if (value === undefined) return defaultValue;
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSpawn(flags) {
  if (flags["spawn-x"] === undefined && flags["spawn-y"] === undefined) return undefined;
  const x = Number.parseFloat(flags["spawn-x"]);
  const y = Number.parseFloat(flags["spawn-y"]);
  if (!normalizedCoordinate(x) || !normalizedCoordinate(y)) {
    throw new Error("--spawn-x and --spawn-y must both be finite normalized coordinates between 0 and 1.");
  }
  return { x, y };
}

function normalizedCoordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

async function main() {
  const { command, flags: parsedFlags } = parseArgs(process.argv.slice(2));
  let flags = parsedFlags;
  if (!commands.has(command)) {
    console.error(`Unknown command: ${command}\n`);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (command === "help" || flags.help) {
    console.log(usage());
    return;
  }
  if (flags.config) {
    const profile = await loadConfigProfile(String(flags.config));
    flags = mergeConfigFlags(flags, profile);
  }
  if (command === "probe") return probe(flags);
  if (command === "record") return record(flags);
  if (command === "bot") return bot(flags);
  if (command === "evaluate") return evaluate(flags);
  if (command === "tune") return tune(flags);
  if (command === "analyze") return analyze(flags);
  if (command === "train-policy") return trainPolicy(flags);
  if (command === "train-outcome-policy") return trainOutcomePolicy(flags);
  if (command === "train-action-policy") return trainActionPolicy(flags);
  if (command === "evaluate-outcome-policy") return evaluateOutcomePolicy(flags);
  if (command === "evaluate-action-policy") return evaluateActionPolicy(flags);
  if (command === "lobby-probe") return lobbyProbe(flags);
  if (command === "lobby-watch") return lobbyWatch(flags);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
