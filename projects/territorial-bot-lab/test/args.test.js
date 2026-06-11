import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  AdaptiveCustomScenarioStrategy,
  CustomScenarioOpeningStrategy,
  ScoutStrategy,
  StrategyContext,
} from "../src/strategy.js";
import {
  extractMapLabels,
  extractTelemetry,
  parseTimeSeconds,
  scoreTelemetry,
  summarizePlacement,
} from "../src/telemetry.js";
import {
  chooseNeighborRegionTarget,
  chooseVisualExpansionTarget,
  decodeCanvasGrid,
} from "../src/visual.js";
import { summarizeBotRun } from "../src/run-summary.js";
import { compactVisualState, recordDecision } from "../src/decision-samples.js";
import {
  chooseAttackSliderFromProbe,
  chooseTargetFromProbes,
  targetProbeCandidates,
} from "../src/target-probing.js";
import { summarizeRunArtifacts } from "../src/analysis.js";
import {
  buildObservationTrainingExamples,
  buildOutcomeTrainingSet,
  buildTrainingExamples,
  choosePolicyTarget,
  evaluatePolicyOnOutcomeArtifacts,
  evaluatePolicyExamples,
  trainLinearPolicy,
} from "../src/policy.js";
import {
  shouldBackoffForTerritoryStall,
  updateTerritoryProgress,
} from "../src/progress.js";
import {
  activeFailedTargets,
  advanceTargetMemory,
  rememberFailedTarget,
  shouldRememberFailedTarget,
} from "../src/target-memory.js";
import {
  buildTuneConfigs,
  formatTuneConfigLabel,
  normalizeTuneObjective,
  rankEvaluationGames,
  rankTuneResults,
  summarizeTuneGames,
  tuneConfigToFlags,
} from "../src/tuning.js";
import {
  buildBestTuneProfile,
  mergeConfigFlags,
  normalizeConfigProfile,
} from "../src/config-profile.js";
import {
  buildObservationSample,
  extractActionLabels,
  summarizeActions,
  summarizeObservationSamples,
} from "../src/observation.js";
import {
  assessLobbyReadiness,
  assessLobbyProbe,
  detectLobbyScreen,
  expectedPlayersSeen,
  lobbyRouteSteps,
  normalizeExpectedPlayers,
  normalizePlayerLabel,
  summarizeLobbyState,
} from "../src/lobby.js";
import {
  parseArgs,
  usage,
} from "../src/cli.js";

test("parseArgs treats top-level and subcommand help as help-only flags", () => {
  assert.equal(parseArgs(["--help"]).command, "help");
  assert.equal(parseArgs(["-h"]).command, "help");

  const botHelp = parseArgs(["bot", "--help"]);
  assert.equal(botHelp.command, "bot");
  assert.equal(botHelp.flags.help, true);

  const shortBotHelp = parseArgs(["bot", "-h"]);
  assert.equal(shortBotHelp.command, "bot");
  assert.equal(shortBotHelp.flags.help, true);

  assert.equal(parseArgs(["train-outcome-policy", "--input", "artifacts"]).command, "train-outcome-policy");
  assert.equal(parseArgs(["evaluate-outcome-policy", "--policy", "policy.json"]).command, "evaluate-outcome-policy");
  assert.match(usage(), /train-outcome-policy/);
  assert.match(usage(), /evaluate-outcome-policy/);
  assert.match(usage(), /Public multiplayer control is intentionally not implemented/);
});

test("ScoutStrategy starts with a summary log action", async () => {
  const harness = {
    async snapshot() {
      return {
        state: {
          canvases: [{ id: "canvasA" }],
          texts: [{ text: "Play" }],
        },
      };
    },
  };
  const context = new StrategyContext(harness, {});
  const strategy = new ScoutStrategy();
  const action = await strategy.nextAction(context);

  assert.equal(action.type, "log");
  assert.match(action.message, /canvas=1/);
});

test("ScoutStrategy can be configured to click a play-like menu", async () => {
  const harness = {
    async snapshot() {
      return {
        state: {
          canvases: [{ id: "canvasA" }],
          texts: [{ text: "Play Offline" }],
        },
      };
    },
  };
  const context = new StrategyContext(harness, { autoClickCenter: true });
  const strategy = new ScoutStrategy();
  await strategy.nextAction(context);
  const action = await strategy.nextAction(context);

  assert.equal(action.type, "click");
  assert.equal(action.x, 0.5);
  assert.equal(action.y, 0.52);
});

test("CustomScenarioOpeningStrategy starts by opening custom scenario", async () => {
  const context = new StrategyContext({}, {});
  const strategy = new CustomScenarioOpeningStrategy();
  const action = await strategy.nextAction(context);

  assert.equal(action.type, "click");
  assert.equal(action.x, 0.56);
  assert.equal(action.y, 0.516);
});

test("lobbyRouteSteps exposes safe real-client menu routes", () => {
  assert.deepEqual(lobbyRouteSteps("main"), []);
  assert.equal(lobbyRouteSteps("game-menu")[0].label, "main-menu-game-menu");
  assert.equal(lobbyRouteSteps("join-lobby-2")[1].label, "game-menu-join-lobby-2");
  assert.throws(() => lobbyRouteSteps("public-match"), /Unknown lobby route/);
});

test("summarizeLobbyState detects DOM menu and loading screens", () => {
  const menu = summarizeLobbyState({
    snapshot: {
      url: "https://territorial.io/",
      title: "Territorial.io",
      state: {
        texts: [{ text: "7 Jun 2026 [2.16.3]" }],
      },
    },
    dom: {
      bodyText: "Game Menu\nJoin Lobby 2\nSettings\nBack",
      elements: [
        { tag: "div", text: "Join Lobby 2", rect: { x: 250, y: 270, width: 220, height: 120 } },
      ],
    },
    network: [
      { type: "websocket-open", id: 1, url: "wss://example.invalid/socket" },
      { type: "websocket-frame-received", id: 1, bytes: 12 },
    ],
  });
  const loading = detectLobbyScreen({ canvasRecentTexts: ["Back", "Loading"] });
  const mainMenu = detectLobbyScreen({ elementTexts: ["Multiplayer", "Custom Scenario", "Game Menu"] });

  assert.equal(menu.detectedScreen, "game-menu");
  assert.equal(menu.hasJoinLobbyText, true);
  assert.equal(menu.network.webSocketCount, 1);
  assert.equal(menu.network.webSocketFrameCount, 1);
  assert.equal(loading, "loading");
  assert.equal(mainMenu, "main-menu");
});

test("summarizeLobbyState detects a loaded lobby and route readiness", () => {
  const lobby = summarizeLobbyState({
    snapshot: {
      url: "https://territorial.io/",
      title: "Territorial.io",
      state: {
        texts: [{ text: "Loading" }],
      },
    },
    dom: {
      viewport: { width: 1000, height: 1000 },
      elements: [
        { tag: "div", text: "Lobby", rect: { x: 0, y: 0, width: 100, height: 40 } },
        { tag: "button", text: "Chat", rect: { x: 0, y: 200, width: 200, height: 60 } },
        { tag: "button", text: "Players\n5\nPlayer 12", rect: { x: 200, y: 200, width: 200, height: 60 } },
        { tag: "div", text: "🟢 POMNI🟢 [龙庭]egg⚪ TTBotLab", rect: { x: 0, y: 300, width: 600, height: 60 } },
        { tag: "span", text: "MP: 100   SP: 20   Lobby: 5", rect: { x: 0, y: 10, width: 200, height: 20 } },
        { tag: "button", text: "Close", rect: { x: 0, y: 830, width: 200, height: 60 } },
        { tag: "button", text: "Ready\n2", rect: { x: 200, y: 830, width: 200, height: 60 } },
      ],
    },
    network: [
      { type: "websocket-open", id: 1, url: "wss://territorial.io/s52/" },
      { type: "websocket-open", id: 2, url: "wss://example.territorial.io/s52/" },
      { type: "websocket-frame-received", id: 2, bytes: 24 },
    ],
  });
  const assessment = assessLobbyProbe([
    { detectedScreen: "main-menu", network: { webSockets: [] } },
    lobby,
  ]);
  const stuck = assessLobbyProbe([
    {
      detectedScreen: "loading",
      network: { webSocketCount: 1, webSocketFrameCount: 2, webSockets: [{ url: "wss://territorial.io/s52/" }] },
    },
  ]);

  assert.equal(lobby.detectedScreen, "lobby");
  assert.equal(lobby.hasLoadingText, true);
  assert.equal(lobby.lobby.hasReadyButton, true);
  assert.equal(lobby.lobby.playerCount, 5);
  assert.equal(lobby.lobby.readyCount, 2);
  assert.deepEqual(lobby.lobby.visiblePlayers, ["Player 12", "🟢 POMNI", "🟢 [龙庭]egg", "⚪ TTBotLab"]);
  assert.deepEqual(lobby.lobby.readyTarget.normalizedViewport, { x: 0.3, y: 0.86 });
  assert.equal(assessment.status, "entered-lobby");
  assert.equal(assessment.readyVisible, true);
  assert.equal(assessment.playerCount, 5);
  assert.equal(assessment.readyTarget.text, "Ready\n2");
  assert.equal(stuck.status, "stuck-loading");
});

test("expectedPlayersSeen normalizes lobby status dots and clan tags", () => {
  const visiblePlayers = ["🟢 POMNI", "🟢 [龙庭]egg", "⚪ TTBotLab"];
  const expected = expectedPlayersSeen(visiblePlayers, ["TTBotLab", "egg", "missing"]);

  assert.equal(normalizePlayerLabel("🟢 [龙庭]egg"), "egg");
  assert.deepEqual(normalizeExpectedPlayers("TTBotLab, egg, TTBotLab"), ["TTBotLab", "egg"]);
  assert.deepEqual(expected.seenExpectedPlayers, ["TTBotLab", "egg"]);
  assert.deepEqual(expected.missingExpectedPlayers, ["missing"]);
});

test("assessLobbyReadiness reports dry-run readiness without requiring a click", () => {
  const summary = {
    detectedScreen: "lobby",
    lobby: {
      hasReadyButton: true,
      playerCount: 2,
      readyTarget: { text: "Ready\n0", normalizedViewport: { x: 0.74, y: 0.96 } },
      visiblePlayers: ["⚪ TTBotLab", "🟢 FriendOne"],
    },
  };
  const ready = assessLobbyReadiness(summary, {
    expectedPlayers: ["TTBotLab", "FriendOne"],
    minPlayers: 2,
  });
  const waiting = assessLobbyReadiness(summary, {
    expectedPlayers: ["TTBotLab", "FriendTwo"],
    minPlayers: 2,
  });

  assert.equal(ready.readyConditionMet, true);
  assert.equal(ready.reason, "ready-condition-met");
  assert.deepEqual(ready.readyTarget.normalizedViewport, { x: 0.74, y: 0.96 });
  assert.equal(waiting.readyConditionMet, false);
  assert.equal(waiting.reason, "waiting-for-expected-players");
  assert.deepEqual(waiting.missingExpectedPlayers, ["FriendTwo"]);
});

test("buildObservationSample creates compact passive real-client samples", () => {
  const sample = buildObservationSample({
    snapshot: {
      url: "https://territorial.io/",
      state: {
        canvases: [{ width: 1440, height: 900, clientWidth: 1440, clientHeight: 900 }],
        drawCounts: { fillText: 12 },
        texts: [
          { text: "Player 9" },
          { text: "1 200" },
          { text: "Players" },
          { text: "512" },
          { text: "Percentage" },
          { text: "0.04%" },
          { text: "Interest" },
          { text: "3.50%" },
          { text: "Income" },
          { text: "42" },
          { text: "Time" },
          { text: "0:12" },
        ],
      },
    },
    network: [
      { type: "websocket-open", id: 1, url: "wss://territorial.io/s52/" },
      { type: "websocket-frame-received", id: 1, bytes: 20 },
    ],
  }, { sequence: 3, elapsedMs: 1200 });

  assert.equal(sample.schemaVersion, 1);
  assert.equal(sample.sequence, 3);
  assert.equal(sample.telemetry.playerName, "Player 9");
  assert.equal(sample.telemetry.timeSeconds, 12);
  assert.equal(sample.network.webSocketCount, 1);
  assert.equal(sample.network.webSocketFrameCount, 1);
  assert.deepEqual(sample.canvas, { width: 1440, height: 900, clientWidth: 1440, clientHeight: 900 });
  assert.deepEqual(sample.actionSummary, { total: 0, byType: {}, canvasActions: 0 });
  assert.equal(sample.visual, null);
});

test("extractActionLabels normalizes local UI events to canvas coordinates", () => {
  const snapshot = {
    state: {
      canvases: [
        {
          rect: { x: 100, y: 50, width: 400, height: 300 },
        },
      ],
      events: [
        { at: 10, type: "click", x: 300, y: 200, button: 0 },
        { at: 11, type: "pointermove", x: 320, y: 210, button: -1 },
        { at: 12, type: "pointerdown", x: 50, y: 60, button: 0 },
        { at: 13, type: "keydown", key: "Enter" },
      ],
    },
  };

  const actions = extractActionLabels(snapshot, { sinceAt: 10 });
  const actionsWithMoves = extractActionLabels(snapshot, { sinceAt: 10, includePointerMoves: true });

  assert.equal(actions.length, 2);
  assert.equal(actions[0].type, "pointerdown");
  assert.deepEqual(actions[0].canvas, { x: -0.125, y: 0.03333333333333333, inside: false });
  assert.equal(actions[1].key, "Enter");
  assert.equal(actions[1].canvas, null);
  assert.equal(actionsWithMoves.length, 3);
  assert.deepEqual(summarizeActions(actionsWithMoves), {
    total: 3,
    byType: { pointermove: 1, pointerdown: 1, keydown: 1 },
    canvasActions: 1,
  });
});

test("summarizeObservationSamples reports dataset coverage and final state", () => {
  const samples = [
    {
      score: 0.5,
      elapsedMs: 0,
      telemetry: { playerName: "Player 9", ownCenter: null, mapLabels: [] },
      network: { webSocketCount: 1, webSocketFrameCount: 2, webSockets: [{ url: "wss://territorial.io/s52/" }] },
      visual: null,
      actions: [{ type: "click", canvas: { inside: true } }],
    },
    {
      score: 0.75,
      elapsedMs: 1000,
      telemetry: {
        playerName: "Player 9",
        ownCenter: { x: 0.5, y: 0.5 },
        mapLabels: [{ name: "Player 9", relation: "own" }],
      },
      network: { webSocketCount: 1, webSocketFrameCount: 4, webSockets: [{ url: "wss://territorial.io/s52/" }] },
      visual: { ownedCellCount: 4, frontierCount: 2, neighborRegionCount: 1, recommendedTarget: { x: 0.6, y: 0.5 } },
      actions: [{ type: "keydown", canvas: null }],
    },
  ];

  const summary = summarizeObservationSamples(samples, {
    durationMs: 1000,
    tickMs: 500,
    visualCols: 80,
    visualRows: 50,
    labelActions: true,
    playerName: "TTBotLab",
    playerNameSet: true,
  });

  assert.equal(summary.samples.total, 2);
  assert.equal(summary.samples.withOwnCenter, 1);
  assert.equal(summary.samples.withVisual, 1);
  assert.equal(summary.samples.withMapLabels, 1);
  assert.equal(summary.score.mean, 0.625);
  assert.deepEqual(summary.playerNames, ["Player 9"]);
  assert.deepEqual(summary.actions, { total: 2, byType: { click: 1, keydown: 1 }, canvasActions: 1 });
  assert.equal(summary.options.labelActions, true);
  assert.deepEqual(summary.network.observedServerUrls, ["wss://territorial.io/s52/"]);
  assert.equal(summary.options.playerNameSet, true);
});

test("buildObservationTrainingExamples learns from action-labeled visual clicks", () => {
  const observation = {
    telemetry: {
      visibleTroops: 1000,
      ownCenter: { x: 0.5, y: 0.5 },
      mapLabels: [],
    },
    visual: {
      center: { x: 0.5, y: 0.5 },
      neighborRegions: [
        {
          target: { x: 0.62, y: 0.5 },
          score: 12,
          cellCount: 20,
          borderCellCount: 5,
          sizeVsOwned: 0.2,
        },
        {
          target: { x: 0.32, y: 0.5 },
          score: 1,
          cellCount: 4,
          borderCellCount: 1,
          sizeVsOwned: 0.04,
        },
      ],
      frontier: [],
    },
    actions: [
      { type: "click", canvas: { x: 0.621, y: 0.501, inside: true } },
    ],
  };
  const examples = buildObservationTrainingExamples([observation], { positiveDistance: 0.03 });
  const policy = trainLinearPolicy(examples, { epochs: 4, learningRate: 0.1, margin: 0.1 });
  const choice = choosePolicyTarget(
    observation.visual.neighborRegions.map((region) => ({
      target: region.target,
      source: "neighbor-region",
      visualScore: region.score,
      cellCount: region.cellCount,
      borderCellCount: region.borderCellCount,
      sizeVsOwned: region.sizeVsOwned,
    })),
    observation,
    policy,
  );

  assert.equal(examples.length, 2);
  assert.equal(examples.filter((example) => example.label === 1).length, 1);
  assert.equal(policy.training.decisions, 1);
  assert.deepEqual(choice.target, { x: 0.62, y: 0.5 });
});

test("evaluatePolicyExamples reports ranking metrics for held-out clicks", () => {
  const examples = [
    {
      decisionId: 1,
      label: 0,
      target: { x: 0.2, y: 0.5 },
      source: "frontier",
      features: { bias: 1, visualScore: 0.1 },
    },
    {
      decisionId: 1,
      label: 1,
      target: { x: 0.7, y: 0.5 },
      source: "neighbor-region",
      features: { bias: 1, visualScore: 0.9 },
    },
    {
      decisionId: 2,
      label: 1,
      target: { x: 0.3, y: 0.5 },
      source: "frontier",
      features: { bias: 1, visualScore: 0.2 },
    },
    {
      decisionId: 2,
      label: 0,
      target: { x: 0.8, y: 0.5 },
      source: "neighbor-region",
      features: { bias: 1, visualScore: 0.8 },
    },
  ];
  const evaluation = evaluatePolicyExamples(examples, {
    weights: { bias: 0, visualScore: 1 },
  });

  assert.equal(evaluation.decisions, 2);
  assert.equal(evaluation.metrics.top1Accuracy, 0.5);
  assert.equal(evaluation.metrics.top3Accuracy, 1);
  assert.equal(evaluation.metrics.meanBestPositiveRank, 1.5);
  assert.equal(evaluation.metrics.meanReciprocalRank, 0.75);
  assert.equal(evaluation.details.length, 2);
});

test("extractTelemetry reads basic sidebar stats", () => {
  const telemetry = extractTelemetry({
    url: "https://territorial.io/",
    state: {
      texts: [
        { text: "Players" },
        { text: "512" },
        { text: "Percentage" },
        { text: "0.05%" },
        { text: "Interest" },
        { text: "3.46%" },
        { text: "Income" },
        { text: "12" },
        { text: "Time" },
        { text: "0:10" },
        { text: "MAP:" },
        { text: "Island" },
      ],
    },
  });

  assert.equal(telemetry.players, 512);
  assert.equal(telemetry.percentage, 0.0005);
  assert.equal(telemetry.interest, 0.0346);
  assert.equal(telemetry.income, 12);
  assert.equal(telemetry.time, "0:10");
  assert.equal(telemetry.map, "Island");
});

test("extractTelemetry parses leaderboard rank and visible troops", () => {
  const telemetry = extractTelemetry({
    state: {
      texts: [
        { text: "1." },
        { text: "Exarchate of Africa" },
        { text: "60" },
        { text: "470." },
        { text: "Player 644" },
        { text: "140" },
        { text: "Player 644" },
        { text: "1 357" },
        { text: "Players" },
        { text: "512" },
      ],
    },
  });

  assert.equal(telemetry.playerName, "Player 644");
  assert.equal(telemetry.ownRank, 470);
  assert.equal(telemetry.ownLeaderboardScore, 140);
  assert.equal(telemetry.ownVisibleTroops, 1357);
  assert.ok(scoreTelemetry(telemetry) > 0);
});

test("summarizePlacement reports rank percentile and top-rate flags", () => {
  const placement = summarizePlacement({ ownRank: 84, players: 512 });
  const unknown = summarizePlacement({ ownRank: null, players: 512 });

  assert.deepEqual(placement, {
    rank: 84,
    players: 512,
    percentile: 0.837891,
    rankFraction: 0.164063,
    top10: false,
    top25: true,
    top50: true,
  });
  assert.deepEqual(unknown, {
    rank: null,
    players: 512,
    percentile: null,
    rankFraction: null,
    top10: null,
    top25: null,
    top50: null,
  });
});

test("extractTelemetry ignores stale leaderboard ranks", () => {
  const telemetry = extractTelemetry({
    state: {
      texts: [
        { text: "14." },
        { text: "Player 9" },
        { text: "12" },
        ...Array.from({ length: 85 }, (_, index) => ({ text: `noise-${index}` })),
        { text: "512." },
        { text: "Player 9" },
        { text: "12" },
        { text: "Player 9" },
        { text: "1 000" },
      ],
    },
  });

  assert.equal(telemetry.ownRank, 512);
});

test("parseTimeSeconds handles game clock strings", () => {
  assert.equal(parseTimeSeconds("0:10"), 10);
  assert.equal(parseTimeSeconds("2:03"), 123);
  assert.equal(parseTimeSeconds("bad"), null);
});

test("extractTelemetry ignores stale choose-start labels", () => {
  const telemetry = extractTelemetry({
    state: {
      texts: [
        { text: "Choose your start position!" },
        ...Array.from({ length: 90 }, (_, index) => ({ text: String(index) })),
      ],
    },
  });

  assert.equal(telemetry.choosingStart, false);
});

test("extractTelemetry parses selected attack labels", () => {
  const telemetry = extractTelemetry({
    state: {
      texts: [
        { text: "Player 1" },
        { text: "1 500" },
        { text: "473 (31%)" },
      ],
    },
  });

  assert.deepEqual(telemetry.selectedTarget, {
    troops: 473,
    percent: 0.31,
    label: "473 (31%)",
  });
  assert.deepEqual(telemetry.selectedAttack, {
    troops: 473,
    percent: 0.31,
    label: "473 (31%)",
  });
  assert.equal(telemetry.selectedAttackTroops, 473);
  assert.equal(telemetry.selectedAttackPercent, 0.31);
  assert.equal(telemetry.selectedTargetTroops, 473);
  assert.equal(telemetry.selectedTargetPercent, 0.31);
});

test("extractTelemetry finds the own map label anchor", () => {
  const telemetry = extractTelemetry({
    state: {
      canvases: [{ width: 1000, height: 800 }],
      texts: [
        { text: "Player 7", x: 40, y: 200, screen: { x: 40, y: 200 }, font: "18px system-ui" },
        { text: "Player 7", x: 620, y: 360, screen: { x: 620, y: 360 }, font: "bold 42px system-ui" },
        { text: "1 200", x: 620, y: 390, screen: { x: 620, y: 390 }, font: "bold 23px system-ui" },
      ],
    },
  });

  assert.equal(telemetry.playerName, "Player 7");
  assert.deepEqual(telemetry.ownCenter, { x: 0.62, y: 0.45 });
  assert.equal(telemetry.ownLabel.fontSize, 42);
  assert.equal(telemetry.mapLabels[0].troops, 1200);
  assert.equal(telemetry.mapLabels[0].relation, "own");
});

test("extractTelemetry uses a known custom player name as the own label", () => {
  const telemetry = extractTelemetry(
    {
      state: {
        canvases: [{ width: 1000, height: 800 }],
        texts: [
          { text: "TTBotLab", x: 560, y: 360, screen: { x: 560, y: 360 }, font: "bold 42px system-ui", at: 2 },
          { text: "1 131", x: 560, y: 392, screen: { x: 560, y: 392 }, font: "bold 23px system-ui", at: 2 },
          { text: "Neutral Land", x: 500, y: 500, screen: { x: 500, y: 500 }, font: "bold 24px system-ui", at: 3 },
          { text: "800", x: 500, y: 530, screen: { x: 500, y: 530 }, font: "bold 20px system-ui", at: 3 },
        ],
      },
    },
    { playerName: "TTBotLab" },
  );

  assert.equal(telemetry.playerName, "TTBotLab");
  assert.equal(telemetry.ownVisibleTroops, 1131);
  assert.deepEqual(telemetry.ownCenter, { x: 0.56, y: 0.45 });
  assert.equal(telemetry.ownLabel.name, "TTBotLab");
  assert.equal(telemetry.mapLabels.find((label) => label.name === "TTBotLab").relation, "own");
  assert.equal(telemetry.mapLabels.find((label) => label.name === "Neutral Land").relation, "neutral");
});

test("extractMapLabels pairs visible map names with troop counts", () => {
  const labels = extractMapLabels(
    {
      state: {
        canvases: [{ width: 1000, height: 800 }],
        texts: [
          { text: "Player 7", x: 40, y: 200, screen: { x: 40, y: 200 }, font: "18px system-ui", at: 1 },
          { text: "12", x: 300, y: 200, screen: { x: 300, y: 200 }, font: "18px system-ui", at: 1 },
          { text: "Player 7", x: 620, y: 360, screen: { x: 620, y: 360 }, font: "bold 42px system-ui", at: 2 },
          { text: "1 200", x: 620, y: 392, screen: { x: 620, y: 392 }, font: "bold 23px system-ui", at: 2 },
          { text: "Neutral Land", x: 500, y: 500, screen: { x: 500, y: 500 }, font: "bold 24px system-ui", at: 3 },
          { text: "800", x: 500, y: 530, screen: { x: 500, y: 530 }, font: "bold 20px system-ui", at: 3 },
        ],
      },
    },
    { playerName: "Player 7" },
  );

  assert.deepEqual(
    labels.map((label) => ({ name: label.name, troops: label.troops, relation: label.relation })),
    [
      { name: "Neutral Land", troops: 800, relation: "neutral" },
      { name: "Player 7", troops: 1200, relation: "own" },
    ],
  );
});

test("extractTelemetry marks leaderboard and non-own player map labels as opponents", () => {
  const telemetry = extractTelemetry({
    state: {
      canvases: [{ width: 1000, height: 800 }],
      texts: [
        { text: "Player 7", x: 620, y: 360, screen: { x: 620, y: 360 }, font: "bold 42px system-ui", at: 2 },
        { text: "1 200", x: 620, y: 392, screen: { x: 620, y: 392 }, font: "bold 23px system-ui", at: 2 },
        { text: "Aulikara Empire", x: 500, y: 500, screen: { x: 500, y: 500 }, font: "bold 24px system-ui", at: 3 },
        { text: "800", x: 500, y: 530, screen: { x: 500, y: 530 }, font: "bold 20px system-ui", at: 3 },
        { text: "1." },
        { text: "Aulikara Empire" },
        { text: "40" },
        { text: "512." },
        { text: "Player 7" },
        { text: "12" },
      ],
    },
  });
  const playerLabels = extractMapLabels(
    {
      state: {
        canvases: [{ width: 1000, height: 800 }],
        texts: [
          { text: "Player 7", x: 620, y: 360, screen: { x: 620, y: 360 }, font: "bold 42px system-ui", at: 2 },
          { text: "1 200", x: 620, y: 392, screen: { x: 620, y: 392 }, font: "bold 23px system-ui", at: 2 },
          { text: "Player 8", x: 500, y: 500, screen: { x: 500, y: 500 }, font: "bold 24px system-ui", at: 3 },
          { text: "800", x: 500, y: 530, screen: { x: 500, y: 530 }, font: "bold 20px system-ui", at: 3 },
        ],
      },
    },
    { playerName: "Player 7" },
  );

  assert.equal(telemetry.mapLabels.find((label) => label.name === "Player 7").relation, "own");
  assert.equal(telemetry.mapLabels.find((label) => label.name === "Aulikara Empire").relation, "opponent");
  assert.equal(playerLabels.find((label) => label.name === "Player 8").relation, "opponent");
});

test("decodeCanvasGrid estimates owned color and frontier from a synthetic grid", () => {
  const grid = {
    width: 100,
    height: 100,
    cols: 10,
    rows: 10,
    samples: [],
  };
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const owned = (col === 5 && row === 5) || (col === 5 && row === 4) || (col === 4 && row === 5);
      grid.samples.push({
        col,
        row,
        x: col * 10 + 5,
        y: row * 10 + 5,
        rgba: owned ? [100, 50, 20, 255] : [180, 210, 3, 255],
      });
    }
  }

  const decoded = decodeCanvasGrid(grid);

  assert.deepEqual(decoded.ownedColor, [100, 50, 20, 255]);
  assert.ok(decoded.ownedCellCount >= 3);
  assert.ok(decoded.frontier.length > 0);
  assert.ok(decoded.recommendedTarget.x > 0.2);
  assert.ok(decoded.recommendedTarget.y > 0.2);
});

test("decodeCanvasGrid can use an off-center own label anchor", () => {
  const grid = {
    width: 100,
    height: 100,
    cols: 10,
    rows: 10,
    samples: [],
  };
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const owned = col >= 2 && col <= 3 && row >= 5 && row <= 6;
      grid.samples.push({
        col,
        row,
        x: col * 10 + 5,
        y: row * 10 + 5,
        rgba: owned ? [120, 60, 20, 255] : [180, 210, 3, 255],
      });
    }
  }

  const decoded = decodeCanvasGrid(grid, { center: { x: 0.25, y: 0.55 } });

  assert.deepEqual(decoded.center, { x: 0.25, y: 0.55 });
  assert.deepEqual(decoded.ownedColor, [120, 60, 20, 255]);
  assert.ok(decoded.ownedCellCount >= 4);
  assert.ok(decoded.frontier.length > 0);
});

test("decodeCanvasGrid groups adjacent non-owned neighbor regions", () => {
  const grid = {
    width: 100,
    height: 100,
    cols: 10,
    rows: 10,
    samples: [],
  };
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const owned = col >= 4 && col <= 5 && row >= 4 && row <= 5;
      const blueRegion = col >= 6 && col <= 7 && row >= 4 && row <= 5;
      grid.samples.push({
        col,
        row,
        x: col * 10 + 5,
        y: row * 10 + 5,
        rgba: owned ? [100, 50, 20, 255] : blueRegion ? [30, 90, 170, 255] : [180, 210, 3, 255],
      });
    }
  }

  const decoded = decodeCanvasGrid(grid);

  assert.ok(decoded.neighborRegions.length > 0);
  assert.ok(decoded.neighborRegions[0].target.x > 0.2);
  assert.ok(decoded.recommendedRegionTarget);
});

test("compactVisualState keeps bounded candidate features", () => {
  const compact = compactVisualState(
    {
      grid: { width: 100, height: 100, cols: 10, rows: 10 },
      ownedColor: [100, 50, 20, 255],
      ownedCellCount: 10,
      frontier: [
        { x: 0.5, y: 0.4, col: 5, row: 4, rgba: [1, 2, 3, 255], score: 0.2 },
        { x: 0.6, y: 0.4, col: 6, row: 4, rgba: [1, 2, 3, 255], score: 0.1 },
      ],
      neighborRegions: [
        {
          target: { x: 0.7, y: 0.5 },
          cellCount: 5,
          borderCellCount: 2,
          averageColor: [30, 90, 170, 255],
          score: 1.4,
        },
      ],
      recommendedTarget: { x: 0.5, y: 0.4 },
      recommendedRegionTarget: { x: 0.7, y: 0.5 },
    },
    { maxCandidates: 1 },
  );

  assert.equal(compact.frontier.length, 1);
  assert.equal(compact.neighborRegions.length, 1);
  assert.equal(compact.neighborRegions[0].sizeVsOwned, 0.5);
  assert.equal(compact.frontierCount, 2);
});

test("StrategyContext caps recorded decision samples", () => {
  const context = new StrategyContext({}, { maxDecisionSamples: 1 });

  context.recordDecision({ reason: "first" });
  context.recordDecision({ reason: "second" });

  assert.equal(context.decisionSamples.length, 1);
  assert.equal(context.decisionSamples[0].reason, "first");
});

test("recordDecision stores compact target probe features", () => {
  const context = new StrategyContext({}, {});
  recordDecision(context, {
    phase: "midgame-region",
    reason: "probe-labeled-target",
    targetProbes: [
      {
        target: { x: 0.7, y: 0.5 },
        source: "neighbor-region",
        probePass: "low-attack-reprobe",
        visualScore: 3,
        selectedAttackTroops: 400,
        selectedAttackPercent: 0.31,
        selectedAttackRatio: 0.4,
        attackCostSafe: false,
        label: { name: "Neutral Land", troops: 800, relation: "neutral", x: 0.7, y: 0.5 },
        safe: true,
        score: 1.2,
      },
    ],
    targetChoice: {
      reason: "probe-labeled-target",
      target: { x: 0.7, y: 0.5 },
      probe: {
        target: { x: 0.7, y: 0.5 },
        selectedAttackTroops: 400,
        selectedAttackRatio: 0.4,
        safe: true,
      },
    },
    action: { type: "click", x: 0.7, y: 0.5 },
  });

  assert.equal(context.decisionSamples[0].targetProbes.length, 1);
  assert.equal(context.decisionSamples[0].targetProbes[0].probePass, "low-attack-reprobe");
  assert.equal(context.decisionSamples[0].targetProbes[0].selectedAttackTroops, 400);
  assert.equal(context.decisionSamples[0].targetProbes[0].attackCostSafe, false);
  assert.equal(context.decisionSamples[0].targetProbes[0].label.name, "Neutral Land");
  assert.equal(context.decisionSamples[0].targetChoice.probe.selectedAttackRatio, 0.4);
});

test("recordDecision stores compact map label features", () => {
  const context = new StrategyContext({}, {});
  recordDecision(context, {
    telemetry: {
      time: "0:10",
      mapLabels: [
        { name: "Player 1", troops: 1200, nx: 0.5, ny: 0.45, relation: "own" },
        { name: "Neutral Land", troops: 800, nx: 0.6, ny: 0.5, relation: "neutral" },
      ],
    },
    action: { type: "wait" },
  });

  assert.equal(context.decisionSamples[0].telemetry.mapLabels.length, 2);
  assert.deepEqual(context.decisionSamples[0].telemetry.mapLabels[1], {
    name: "Neutral Land",
    troops: 800,
    x: 0.6,
    y: 0.5,
    relation: "neutral",
  });
});

test("targetProbeCandidates prioritizes neighbor regions and filters recent targets", () => {
  const candidates = targetProbeCandidates(
    {
      frontier: [
        { x: 0.5, y: 0.4, score: 1 },
      ],
      neighborRegions: [
        { target: { x: 0.7, y: 0.5 }, score: 10, cellCount: 20, borderCellCount: 3 },
        { target: { x: 0.8, y: 0.5 }, score: 5, cellCount: 10, borderCellCount: 2 },
      ],
    },
    [{ x: 0.3, y: 0.5 }],
    {
      phase: "midgame-region",
      recentTargets: [{ x: 0.7, y: 0.5 }],
      minRecentDistance: 0.06,
      maxCandidates: 2,
    },
  );

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].source, "neighbor-region");
  assert.deepEqual(candidates[0].target, { x: 0.8, y: 0.5 });
});

test("targetProbeCandidates promotes visible map labels and skips own labels", () => {
  const candidates = targetProbeCandidates(
    {
      frontier: [
        { x: 0.5, y: 0.4, score: 1 },
      ],
      neighborRegions: [
        { target: { x: 0.7, y: 0.5 }, score: 10, cellCount: 20, borderCellCount: 3 },
      ],
    },
    [],
    {
      phase: "midgame-region",
      ownCenter: { x: 0.5, y: 0.5 },
      maxCandidates: 2,
      mapLabels: [
        { name: "Player 1", troops: 1000, nx: 0.5, ny: 0.5, relation: "own" },
        { name: "Neutral Land", troops: 800, nx: 0.62, ny: 0.52, relation: "neutral" },
      ],
    },
  );

  assert.equal(candidates[0].source, "map-label");
  assert.deepEqual(candidates[0].target, { x: 0.62, y: 0.52 });
  assert.equal(candidates[0].label.name, "Neutral Land");
  assert.equal(candidates.length, 2);
});

test("targetProbeCandidates annotates labeled target troop safety", () => {
  const candidates = targetProbeCandidates(
    {
      frontier: [],
      neighborRegions: [
        { target: { x: 0.7, y: 0.5 }, score: 10, cellCount: 20, borderCellCount: 3 },
      ],
    },
    [],
    {
      phase: "midgame-region",
      ownCenter: { x: 0.5, y: 0.5 },
      ownVisibleTroops: 1000,
      maxTargetTroopRatio: 0.85,
      maxCandidates: 3,
      mapLabels: [
        { name: "Strong", troops: 1200, nx: 0.58, ny: 0.52, relation: "unknown" },
        { name: "Weak", troops: 300, nx: 0.62, ny: 0.52, relation: "neutral" },
      ],
    },
  );

  const weak = candidates.find((candidate) => candidate.label?.name === "Weak");
  const strong = candidates.find((candidate) => candidate.label?.name === "Strong");

  assert.equal(candidates[0].label.name, "Weak");
  assert.equal(weak.labelTroopRatio, 0.3);
  assert.equal(weak.labelTroopCap, 0.85);
  assert.equal(weak.troopSafe, true);
  assert.equal(weak.safe, true);
  assert.equal(strong.labelTroopRatio, 1.2);
  assert.equal(strong.labelTroopCap, 0.65);
  assert.equal(strong.troopSafe, false);
  assert.equal(strong.safe, false);
});

test("targetProbeCandidates uses a stricter default cap for unknown opponent labels", () => {
  const candidates = targetProbeCandidates(
    {
      frontier: [],
      neighborRegions: [],
    },
    [],
    {
      phase: "midgame-region",
      ownCenter: { x: 0.5, y: 0.5 },
      ownVisibleTroops: 1000,
      maxTargetTroopRatio: 0.85,
      maxCandidates: 2,
      mapLabels: [
        { name: "Neutral Land", troops: 700, nx: 0.62, ny: 0.52, relation: "neutral" },
        { name: "Opponent", troops: 700, nx: 0.58, ny: 0.52, relation: "unknown" },
      ],
    },
  );
  const neutral = candidates.find((candidate) => candidate.label?.name === "Neutral Land");
  const opponent = candidates.find((candidate) => candidate.label?.name === "Opponent");

  assert.equal(neutral.labelTroopRatio, 0.7);
  assert.equal(neutral.labelTroopCap, 0.85);
  assert.equal(neutral.troopSafe, true);
  assert.equal(opponent.labelTroopRatio, 0.7);
  assert.equal(opponent.labelTroopCap, 0.65);
  assert.equal(opponent.troopSafe, false);
});

test("targetProbeCandidates avoids temporarily failed target areas", () => {
  const candidates = targetProbeCandidates(
    {
      frontier: [
        { x: 0.5, y: 0.4, score: 1 },
      ],
      neighborRegions: [
        { target: { x: 0.7, y: 0.5 }, score: 10, cellCount: 20, borderCellCount: 3 },
        { target: { x: 0.82, y: 0.5 }, score: 5, cellCount: 10, borderCellCount: 2 },
      ],
    },
    [{ x: 0.3, y: 0.5 }],
    {
      phase: "midgame-region",
      maxCandidates: 2,
      avoidTargets: [{ target: { x: 0.7, y: 0.5 }, distance: 0.09 }],
    },
  );

  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates[0].target, { x: 0.82, y: 0.5 });
  assert.equal(candidates.every((candidate) => candidate.target.x !== 0.7), true);
});

test("chooseTargetFromProbes prefers labeled visual targets", () => {
  const choice = chooseTargetFromProbes(
    [
      {
        target: { x: 0.6, y: 0.5 },
        visualScore: 20,
        selectedAttackTroops: 250,
        cellCount: 50,
      },
      {
        target: { x: 0.7, y: 0.5 },
        visualScore: 5,
        selectedAttackTroops: 300,
        cellCount: 8,
      },
    ],
    { ownVisibleTroops: 1000 },
    {},
  );

  assert.deepEqual(choice.target, { x: 0.6, y: 0.5 });
  assert.equal(choice.reason, "probe-labeled-target");
  assert.equal(choice.probe.safe, true);
});

test("chooseTargetFromProbes can require selected attack labels", () => {
  const choice = chooseTargetFromProbes(
    [
      { target: { x: 0.6, y: 0.5 }, visualScore: 1 },
      { target: { x: 0.7, y: 0.5 }, visualScore: 1 },
    ],
    { ownVisibleTroops: 1000 },
    { requireAttackLabel: true },
  );

  assert.equal(choice.target, null);
  assert.equal(choice.reason, "no-labeled-target");
});

test("chooseTargetFromProbes skips labeled targets above the troop ratio cap", () => {
  const choice = chooseTargetFromProbes(
    [
      {
        target: { x: 0.6, y: 0.5 },
        source: "map-label",
        visualScore: 100,
        selectedAttackTroops: 100,
        label: { name: "Strong", relation: "unknown", troops: 1200, x: 0.6, y: 0.5 },
      },
      {
        target: { x: 0.7, y: 0.5 },
        source: "map-label",
        visualScore: 20,
        selectedAttackTroops: 100,
        label: { name: "Weak", relation: "neutral", troops: 300, x: 0.7, y: 0.5 },
      },
    ],
    { ownVisibleTroops: 1000 },
    { maxTargetTroopRatio: 0.85 },
  );

  const strong = choice.probes.find((probe) => probe.label?.name === "Strong");

  assert.deepEqual(choice.target, { x: 0.7, y: 0.5 });
  assert.equal(choice.probe.label.name, "Weak");
  assert.equal(strong.labelTroopRatio, 1.2);
  assert.equal(strong.labelTroopCap, 0.65);
  assert.equal(strong.troopSafe, false);
  assert.equal(strong.safe, false);
});

test("chooseTargetFromProbes applies opponent and neutral troop caps separately", () => {
  const choice = chooseTargetFromProbes(
    [
      {
        target: { x: 0.6, y: 0.5 },
        source: "map-label",
        visualScore: 100,
        selectedAttackTroops: 100,
        label: { name: "Opponent", relation: "unknown", troops: 700, x: 0.6, y: 0.5 },
      },
      {
        target: { x: 0.7, y: 0.5 },
        source: "map-label",
        visualScore: 20,
        selectedAttackTroops: 100,
        label: { name: "Neutral Land", relation: "neutral", troops: 700, x: 0.7, y: 0.5 },
      },
    ],
    { ownVisibleTroops: 1000 },
    { maxTargetTroopRatio: 0.85 },
  );
  const opponent = choice.probes.find((probe) => probe.label?.name === "Opponent");
  const neutral = choice.probes.find((probe) => probe.label?.name === "Neutral Land");

  assert.deepEqual(choice.target, { x: 0.7, y: 0.5 });
  assert.equal(opponent.labelTroopCap, 0.65);
  assert.equal(opponent.troopSafe, false);
  assert.equal(neutral.labelTroopCap, 0.85);
  assert.equal(neutral.troopSafe, true);
});

test("chooseTargetFromProbes skips targets above the selected attack ratio cap", () => {
  const choice = chooseTargetFromProbes(
    [
      {
        target: { x: 0.6, y: 0.5 },
        visualScore: 100,
        selectedAttackTroops: 500,
        cellCount: 50,
      },
      {
        target: { x: 0.7, y: 0.5 },
        visualScore: 20,
        selectedAttackTroops: 180,
        cellCount: 8,
      },
    ],
    { ownVisibleTroops: 1000 },
    { maxSelectedAttackRatio: 0.34 },
  );
  const expensive = choice.probes.find((probe) => probe.target.x === 0.6);

  assert.deepEqual(choice.target, { x: 0.7, y: 0.5 });
  assert.equal(expensive.selectedAttackRatio, 0.5);
  assert.equal(expensive.attackCostSafe, false);
  assert.equal(expensive.safe, false);
});

test("chooseAttackSliderFromProbe caps oversized selected attacks", () => {
  const choice = {
    probe: {
      selectedAttackPercent: 0.45,
      cellCount: 5,
      sizeVsOwned: 0.05,
    },
  };

  const slider = chooseAttackSliderFromProbe(choice, { interest: 0.07 }, {
    lowAttackSlider: 0.415,
    normalAttackSlider: 0.455,
    highAttackSlider: 0.48,
    maxSelectedAttackPercent: 0.34,
  });

  assert.deepEqual(slider, { value: 0.415, reason: "cap-selected-attack-percent" });
});

test("chooseAttackSliderFromProbe caps oversized selected attack ratios", () => {
  const choice = {
    probe: {
      selectedAttackTroops: 500,
      selectedAttackRatio: 0.5,
      selectedAttackPercent: 0.25,
      cellCount: 5,
      sizeVsOwned: 0.05,
    },
  };

  const slider = chooseAttackSliderFromProbe(choice, { interest: 0.07, ownVisibleTroops: 1000 }, {
    lowAttackSlider: 0.415,
    normalAttackSlider: 0.455,
    highAttackSlider: 0.48,
    maxSelectedAttackPercent: 0.34,
    maxSelectedAttackRatio: 0.34,
  });

  assert.deepEqual(slider, { value: 0.415, reason: "cap-selected-attack-ratio" });
});

test("chooseAttackSliderFromProbe can increase for small regions with healthy interest", () => {
  const choice = {
    probe: {
      selectedAttackPercent: 0.25,
      cellCount: 4,
      sizeVsOwned: 0.04,
    },
  };

  const slider = chooseAttackSliderFromProbe(choice, { interest: 0.07 }, {
    lowAttackSlider: 0.415,
    normalAttackSlider: 0.455,
    highAttackSlider: 0.48,
    maxSelectedAttackPercent: 0.34,
  });

  assert.deepEqual(slider, { value: 0.48, reason: "small-region-attack-size" });
});

test("chooseAttackSliderFromProbe can increase for weak labeled targets with healthy interest", () => {
  const choice = {
    probe: {
      selectedAttackPercent: 0.25,
      labelTroopRatio: 0.3,
      cellCount: 30,
      sizeVsOwned: 0.3,
      label: { name: "Weak", relation: "neutral", troops: 300 },
    },
  };

  const slider = chooseAttackSliderFromProbe(choice, { interest: 0.07, ownVisibleTroops: 1000 }, {
    lowAttackSlider: 0.415,
    normalAttackSlider: 0.455,
    highAttackSlider: 0.48,
    maxSelectedAttackPercent: 0.34,
    weakTargetTroopRatio: 0.45,
  });

  assert.deepEqual(slider, { value: 0.48, reason: "weak-labeled-target-attack-size" });
});

test("choosePolicyTarget applies labeled target troop cap as a hard guard", () => {
  const policy = {
    kind: "territorial-linear-target-ranker",
    weights: {
      visualScore: 1,
    },
  };
  const choice = choosePolicyTarget(
    [
      {
        target: { x: 0.6, y: 0.5 },
        source: "map-label",
        visualScore: 100,
        label: { name: "Strong", relation: "unknown", troops: 1200, x: 0.6, y: 0.5 },
      },
      {
        target: { x: 0.7, y: 0.5 },
        source: "map-label",
        visualScore: 20,
        label: { name: "Weak", relation: "neutral", troops: 300, x: 0.7, y: 0.5 },
      },
    ],
    { telemetry: { visibleTroops: 1000, ownCenter: { x: 0.5, y: 0.5 } } },
    policy,
    { maxTargetTroopRatio: 0.85 },
  );
  const strong = choice.probes.find((probe) => probe.label?.name === "Strong");

  assert.deepEqual(choice.target, { x: 0.7, y: 0.5 });
  assert.equal(strong.troopSafe, false);
  assert.equal(strong.safe, false);
  assert.ok(strong.policyScore > choice.probe.policyScore);
});

test("choosePolicyTarget applies a stricter opponent troop cap than neutral cap", () => {
  const policy = {
    kind: "territorial-linear-target-ranker",
    weights: {
      visualScore: 1,
    },
  };
  const choice = choosePolicyTarget(
    [
      {
        target: { x: 0.6, y: 0.5 },
        source: "map-label",
        visualScore: 100,
        label: { name: "Opponent", relation: "opponent", troops: 700, x: 0.6, y: 0.5 },
      },
      {
        target: { x: 0.7, y: 0.5 },
        source: "map-label",
        visualScore: 20,
        label: { name: "Neutral Land", relation: "neutral", troops: 700, x: 0.7, y: 0.5 },
      },
    ],
    { telemetry: { visibleTroops: 1000, ownCenter: { x: 0.5, y: 0.5 } } },
    policy,
    { maxTargetTroopRatio: 0.85 },
  );
  const opponent = choice.probes.find((probe) => probe.label?.name === "Opponent");
  const neutral = choice.probes.find((probe) => probe.label?.name === "Neutral Land");

  assert.deepEqual(choice.target, { x: 0.7, y: 0.5 });
  assert.equal(opponent.troopSafe, false);
  assert.equal(opponent.safe, false);
  assert.equal(opponent.features.labelOpponent, 1);
  assert.equal(opponent.features.labelUnknown, 0);
  assert.equal(Number(opponent.features.labelTroopOverCap.toFixed(2)), 0.05);
  assert.equal(neutral.troopSafe, true);
  assert.equal(neutral.safe, true);
});

test("choosePolicyTarget applies selected attack ratio cap as a hard guard", () => {
  const policy = {
    kind: "territorial-linear-target-ranker",
    weights: {
      visualScore: 1,
    },
  };
  const choice = choosePolicyTarget(
    [
      {
        target: { x: 0.6, y: 0.5 },
        source: "neighbor-region",
        visualScore: 100,
        selectedAttackTroops: 500,
      },
      {
        target: { x: 0.7, y: 0.5 },
        source: "neighbor-region",
        visualScore: 20,
        selectedAttackTroops: 180,
      },
    ],
    { telemetry: { visibleTroops: 1000, ownCenter: { x: 0.5, y: 0.5 } } },
    policy,
    { maxSelectedAttackRatio: 0.34 },
  );
  const expensive = choice.probes.find((probe) => probe.target.x === 0.6);

  assert.deepEqual(choice.target, { x: 0.7, y: 0.5 });
  assert.equal(expensive.selectedAttackRatio, 0.5);
  assert.equal(expensive.attackCostSafe, false);
  assert.equal(expensive.safe, false);
  assert.ok(expensive.policyScore > choice.probe.policyScore);
});

test("trainLinearPolicy learns to rank chosen target examples", () => {
  const sample = {
    telemetry: {
      ownCenter: { x: 0.5, y: 0.5 },
      visibleTroops: 1000,
    },
    targetProbes: [
      {
        target: { x: 0.6, y: 0.5 },
        source: "frontier",
        visualScore: 1,
        selectedAttackTroops: 250,
        selectedAttackPercent: 0.31,
        safe: true,
      },
      {
        target: { x: 0.7, y: 0.5 },
        source: "map-label",
        visualScore: 4,
        selectedAttackTroops: 300,
        selectedAttackPercent: 0.31,
        safe: true,
        label: { name: "Neutral Land", relation: "neutral", troops: 700, x: 0.7, y: 0.5 },
      },
    ],
    action: { type: "click", x: 0.7, y: 0.5 },
  };

  const examples = buildTrainingExamples([sample]);
  const policy = trainLinearPolicy(examples, { epochs: 8, learningRate: 0.1, margin: 0.25 });
  const choice = choosePolicyTarget(sample.targetProbes, sample, policy);

  assert.equal(examples.length, 2);
  assert.equal(examples.filter((example) => example.label === 1).length, 1);
  assert.equal(policy.training.decisions, 1);
  assert.equal(choice.reason, "policy-target");
  assert.deepEqual(choice.target, { x: 0.7, y: 0.5 });
  assert.equal(choice.probe.selectedAttackRatio, 0.3);
  assert.ok(choice.probe.policyScore > choice.probes.find((probe) => probe.target.x === 0.6).policyScore);
});

test("buildOutcomeTrainingSet trains only from decisions with future territory growth", () => {
  const productiveDecision = {
    telemetry: {
      ownCenter: { x: 0.5, y: 0.5 },
      visibleTroops: 1000,
    },
    visual: {
      ownedCellCount: 20,
    },
    targetProbes: [
      {
        target: { x: 0.62, y: 0.5 },
        source: "neighbor-region",
        visualScore: 12,
        cellCount: 20,
        borderCellCount: 5,
        safe: true,
      },
      {
        target: { x: 0.32, y: 0.5 },
        source: "frontier",
        visualScore: 1,
        safe: true,
      },
    ],
    action: { type: "attackClick", x: 0.62, y: 0.5 },
  };
  const afterProductiveDecision = {
    telemetry: {
      ownCenter: { x: 0.5, y: 0.5 },
      visibleTroops: 900,
    },
    visual: {
      ownedCellCount: 23,
    },
    action: { type: "wait" },
  };
  const unproductiveDecision = {
    telemetry: {
      ownCenter: { x: 0.5, y: 0.5 },
      visibleTroops: 900,
    },
    visual: {
      ownedCellCount: 23,
    },
    targetProbes: [
      {
        target: { x: 0.7, y: 0.5 },
        source: "neighbor-region",
        visualScore: 30,
        cellCount: 40,
        borderCellCount: 10,
        safe: true,
      },
      {
        target: { x: 0.35, y: 0.5 },
        source: "frontier",
        visualScore: 1,
        safe: true,
      },
    ],
    action: { type: "attackClick", x: 0.7, y: 0.5 },
  };
  const afterUnproductiveDecision = {
    telemetry: {
      ownCenter: { x: 0.5, y: 0.5 },
      visibleTroops: 850,
    },
    visual: {
      ownedCellCount: 23,
    },
    action: { type: "wait" },
  };

  const trainingSet = buildOutcomeTrainingSet(
    [productiveDecision, afterProductiveDecision, unproductiveDecision, afterUnproductiveDecision],
    { outcomeHorizon: 1, minOutcomeOwnedCellGrowth: 1, positiveDistance: 0.03 },
  );
  const policy = trainLinearPolicy(trainingSet.examples, { epochs: 6, learningRate: 0.1, margin: 0.2 });
  const choice = choosePolicyTarget(productiveDecision.targetProbes, productiveDecision, policy);

  assert.equal(trainingSet.examples.length, 2);
  assert.equal(trainingSet.examples.filter((example) => example.label === 1).length, 1);
  assert.equal(trainingSet.outcomes.actionDecisions, 2);
  assert.equal(trainingSet.outcomes.outcomeDecisions, 2);
  assert.equal(trainingSet.outcomes.successfulActions, 1);
  assert.equal(trainingSet.outcomes.unsuccessfulActions, 1);
  assert.equal(trainingSet.outcomes.meanOwnedCellGrowth, 1.5);
  assert.equal(policy.training.decisions, 1);
  assert.deepEqual(choice.target, { x: 0.62, y: 0.5 });
});

test("evaluatePolicyOnOutcomeArtifacts ranks outcome-positive bot decisions", async () => {
  const samples = [
    {
      telemetry: {
        ownCenter: { x: 0.5, y: 0.5 },
        visibleTroops: 1000,
      },
      visual: {
        ownedCellCount: 20,
      },
      targetProbes: [
        {
          target: { x: 0.62, y: 0.5 },
          source: "neighbor-region",
          visualScore: 12,
          safe: true,
        },
        {
          target: { x: 0.32, y: 0.5 },
          source: "frontier",
          visualScore: 1,
          safe: true,
        },
      ],
      action: { type: "attackClick", x: 0.62, y: 0.5 },
    },
    {
      telemetry: {
        ownCenter: { x: 0.5, y: 0.5 },
        visibleTroops: 900,
      },
      visual: {
        ownedCellCount: 23,
      },
      action: { type: "wait" },
    },
    {
      telemetry: {
        ownCenter: { x: 0.5, y: 0.5 },
        visibleTroops: 900,
      },
      visual: {
        ownedCellCount: 23,
      },
      targetProbes: [
        {
          target: { x: 0.7, y: 0.5 },
          source: "neighbor-region",
          visualScore: 30,
          safe: true,
        },
        {
          target: { x: 0.35, y: 0.5 },
          source: "frontier",
          visualScore: 1,
          safe: true,
        },
      ],
      action: { type: "attackClick", x: 0.7, y: 0.5 },
    },
    {
      telemetry: {
        ownCenter: { x: 0.5, y: 0.5 },
        visibleTroops: 850,
      },
      visual: {
        ownedCellCount: 23,
      },
      action: { type: "wait" },
    },
  ];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ttbot-outcome-eval-"));
  const runDir = path.join(tempDir, "run-1");
  await fs.mkdir(runDir);
  await fs.writeFile(
    path.join(runDir, "decision-samples.ndjson"),
    `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
  );

  const evaluation = await evaluatePolicyOnOutcomeArtifacts(
    tempDir,
    {
      kind: "territorial-linear-target-ranker",
      weights: { visualScore: 1 },
    },
    { outcomeHorizon: 1, minOutcomeOwnedCellGrowth: 1, positiveDistance: 0.03 },
  );

  assert.equal(evaluation.files, 1);
  assert.equal(evaluation.samples, 4);
  assert.equal(evaluation.examples, 2);
  assert.equal(evaluation.decisions, 1);
  assert.equal(evaluation.metrics.top1Accuracy, 1);
  assert.equal(evaluation.outcomes.successfulActions, 1);
  assert.equal(evaluation.outcomes.unsuccessfulActions, 1);
});

test("chooseVisualExpansionTarget avoids recent targets", () => {
  const target = chooseVisualExpansionTarget(
    {
      recommendedTarget: { x: 0.5, y: 0.5 },
      frontier: [
        { x: 0.5, y: 0.5 },
        { x: 0.7, y: 0.5 },
      ],
    },
    [],
    { recentTargets: [{ x: 0.51, y: 0.5 }], minRecentDistance: 0.06 },
  );

  assert.deepEqual(target, { x: 0.7, y: 0.5 });
});

test("chooseNeighborRegionTarget prefers region targets", () => {
  const target = chooseNeighborRegionTarget(
    {
      recommendedTarget: { x: 0.5, y: 0.5 },
      frontier: [{ x: 0.5, y: 0.5 }],
      neighborRegions: [
        { target: { x: 0.7, y: 0.5 }, score: 10 },
      ],
    },
  );

  assert.deepEqual(target, { x: 0.7, y: 0.5 });
});

test("chooseNeighborRegionTarget does not repeat stale recommended targets", () => {
  const target = chooseNeighborRegionTarget(
    {
      recommendedTarget: { x: 0.5, y: 0.5 },
      recommendedRegionTarget: { x: 0.7, y: 0.5 },
      frontier: [{ x: 0.7, y: 0.5 }],
      neighborRegions: [
        { target: { x: 0.7, y: 0.5 }, score: 10 },
      ],
    },
    [{ x: 0.3, y: 0.5 }],
    { recentTargets: [{ x: 0.7, y: 0.5 }, { x: 0.5, y: 0.5 }], minRecentDistance: 0.06 },
  );

  assert.deepEqual(target, { x: 0.3, y: 0.5 });
});

test("chooseNeighborRegionTarget avoids failed target areas", () => {
  const target = chooseNeighborRegionTarget(
    {
      recommendedTarget: { x: 0.5, y: 0.5 },
      frontier: [
        { x: 0.7, y: 0.5 },
        { x: 0.82, y: 0.5 },
      ],
      neighborRegions: [
        { target: { x: 0.7, y: 0.5 }, score: 10 },
        { target: { x: 0.82, y: 0.5 }, score: 5 },
      ],
    },
    [{ x: 0.3, y: 0.5 }],
    { avoidTargets: [{ target: { x: 0.7, y: 0.5 }, distance: 0.09 }] },
  );

  assert.deepEqual(target, { x: 0.82, y: 0.5 });
});

test("updateTerritoryProgress tracks sampled owned-cell growth and stall streaks", () => {
  const first = updateTerritoryProgress({}, { ownedCellCount: 10 }, { minOwnedCellGrowth: 2 });
  const stalled = updateTerritoryProgress(first, { ownedCellCount: 11 }, { minOwnedCellGrowth: 2 });
  const progressed = updateTerritoryProgress(stalled, { ownedCellCount: 13 }, { minOwnedCellGrowth: 2 });

  assert.equal(first.ownedCellGrowth, null);
  assert.equal(first.stallStreak, 0);
  assert.equal(stalled.ownedCellGrowth, 1);
  assert.equal(stalled.stallStreak, 1);
  assert.equal(shouldBackoffForTerritoryStall(stalled, { maxStallStreak: 1 }), true);
  assert.equal(shouldBackoffForTerritoryStall(stalled, { maxStallStreak: 1, stallBackoff: false }), false);
  assert.equal(progressed.ownedCellGrowth, 2);
  assert.equal(progressed.stallStreak, 0);
});

test("target memory remembers failed targets with cooldown decay", () => {
  const progress = { ownedCellGrowth: 0 };
  const remembered = rememberFailedTarget({}, { x: 0.7, y: 0.5 }, {
    failedTargetCooldown: 2,
    failedTargetDistance: 0.08,
    ownedCellGrowth: progress.ownedCellGrowth,
  });
  const decayed = advanceTargetMemory(remembered);
  const expired = advanceTargetMemory(decayed);

  assert.equal(shouldRememberFailedTarget(progress, { minSuccessfulTargetGrowth: 1 }), true);
  assert.equal(shouldRememberFailedTarget({ ownedCellGrowth: 2 }, { minSuccessfulTargetGrowth: 1 }), false);
  assert.equal(activeFailedTargets(remembered).length, 1);
  assert.deepEqual(activeFailedTargets(remembered)[0].target, { x: 0.7, y: 0.5 });
  assert.equal(activeFailedTargets(remembered)[0].remaining, 2);
  assert.equal(activeFailedTargets(decayed)[0].remaining, 1);
  assert.equal(activeFailedTargets(expired).length, 0);
});

test("AdaptiveCustomScenarioStrategy pauses when interest is too low", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 000" },
              { text: "Interest" },
              { text: "4.00%" },
              { text: "Time" },
              { text: "0:08" },
            ],
          },
        };
      },
    },
    { minInterest: 0.05, recoveryWaitMs: 777 },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "wait");
  assert.equal(action.ms, 777);
  assert.equal(action.meta.reason, "recover-interest");
  assert.equal(context.decisionSamples.length, 1);
  assert.equal(context.decisionSamples[0].reason, "recover-interest");
  assert.equal(context.decisionSamples[0].telemetry.interest, 0.04);
});

test("AdaptiveCustomScenarioStrategy holds after opening expansion budget", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 000" },
              { text: "Interest" },
              { text: "6.00%" },
              { text: "Time" },
              { text: "0:08" },
            ],
          },
        };
      },
    },
    { maxExpansionClicks: 3, holdWaitMs: 888 },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "wait");
  assert.equal(action.ms, 888);
  assert.equal(action.meta.reason, "opening-budget");
});

test("AdaptiveCustomScenarioStrategy waits for resume interest after opening", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 000" },
              { text: "Interest" },
              { text: "5.00%" },
              { text: "Time" },
              { text: "0:15" },
            ],
          },
        };
      },
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 12,
      resumeInterest: 0.061,
      holdWaitMs: 999,
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "wait");
  assert.equal(action.ms, 999);
  assert.equal(action.meta.reason, "await-resume-interest");
});

test("AdaptiveCustomScenarioStrategy waits for post-opening troop floor", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "900" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
            ],
          },
        };
      },
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 12,
      resumeInterest: 0.061,
      minAttackTroops: 1000,
      holdWaitMs: 444,
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "wait");
  assert.equal(action.ms, 444);
  assert.equal(action.meta.reason, "await-troops");
});

test("AdaptiveCustomScenarioStrategy can set a post-opening attack percentage", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
            ],
          },
        };
      },
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 12,
      resumeInterest: 0.061,
      minAttackTroops: 1000,
      midgamePercent: 0.455,
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "attackPercent");
  assert.equal(action.value, 0.455);
  assert.equal(action.meta.reason, "set-midgame-percent");
  assert.equal(context.decisionSamples.length, 1);
  assert.equal(context.decisionSamples[0].action.type, "attackPercent");
});

test("AdaptiveCustomScenarioStrategy backs off after repeated post-opening no-growth ticks", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      maxStallStreak: 2,
      minOwnedCellGrowth: 1,
      stallBackoffMs: 333,
    },
  );

  const first = await strategy.nextAction(context);
  const second = await strategy.nextAction(context);
  const third = await strategy.nextAction(context);

  assert.equal(first.type, "click");
  assert.equal(second.type, "click");
  assert.equal(second.meta.ownedCellGrowth, 0);
  assert.equal(second.meta.territoryStallStreak, 1);
  assert.equal(third.type, "wait");
  assert.equal(third.ms, 333);
  assert.equal(third.meta.reason, "territory-stall-backoff");
  assert.equal(third.meta.ownedCellGrowth, 0);
  assert.equal(third.meta.territoryStallStreak, 2);
  assert.equal(context.decisionSamples.at(-1).reason, "territory-stall-backoff");
});

test("AdaptiveCustomScenarioStrategy does not count opening no-growth toward stall backoff", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
    },
    {
      maxExpansionClicks: 2,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      maxStallStreak: 2,
      minOwnedCellGrowth: 1,
    },
  );

  const firstOpening = await strategy.nextAction(context);
  const secondOpening = await strategy.nextAction(context);
  const firstMidgame = await strategy.nextAction(context);

  assert.equal(firstOpening.type, "click");
  assert.equal(secondOpening.type, "click");
  assert.equal(secondOpening.meta.phase, "opening-frontier");
  assert.equal(secondOpening.meta.territoryStallStreak, 0);
  assert.equal(firstMidgame.type, "click");
  assert.equal(firstMidgame.meta.phase, "midgame-region");
  assert.equal(firstMidgame.meta.territoryStallStreak, 1);
});

test("AdaptiveCustomScenarioStrategy remembers no-growth midgame targets for avoidance", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      maxStallStreak: 99,
      minSuccessfulTargetGrowth: 1,
      failedTargetCooldown: 4,
      failedTargetDistance: 0.09,
    },
  );

  const first = await strategy.nextAction(context);
  const second = await strategy.nextAction(context);

  assert.equal(first.type, "click");
  assert.equal(second.type, "click");
  assert.deepEqual(second.meta.rememberedFailedTarget, { x: first.x, y: first.y });
  assert.equal(second.meta.failedTargetCount, 1);
  assert.equal(second.meta.avoidedTargetCount, 1);
  assert.notDeepEqual({ x: second.x, y: second.y }, { x: first.x, y: first.y });
  assert.deepEqual(context.decisionSamples[1].action.meta.rememberedFailedTarget, { x: first.x, y: first.y });
});

test("AdaptiveCustomScenarioStrategy holds when all probe targets exceed attack cost cap", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const hoverCalls = [];
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
              ...(hoverCalls.length ? [{ text: "900 (31%)" }] : []),
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
      async hoverCanvas(x, y) {
        hoverCalls.push({ x, y });
      },
      async setAttackPercent() {},
      async wait() {},
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      probeTargets: true,
      targetProbeCount: 2,
      targetProbeMs: 1,
      maxSelectedAttackRatio: 0.2,
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "wait");
  assert.equal(action.meta.reason, "no-target");
  assert.equal(context.decisionSamples[0].reason, "no-safe-target");
  assert.equal(context.decisionSamples[0].targetChoice.reason, "no-safe-target");
  assert.equal(context.decisionSamples[0].targetProbes.every((probe) => probe.attackCostSafe === false), true);
});

test("AdaptiveCustomScenarioStrategy lowers attack slider and reprobes unsafe-cost targets once", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const hoverCalls = [];
  const sliderCalls = [];
  const context = new StrategyContext(
    {
      async snapshot() {
        const lowSliderSet = sliderCalls.at(-1) === 0.35;
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
              ...(hoverCalls.length ? [{ text: lowSliderSet ? "150 (10%)" : "900 (31%)" }] : []),
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
      async hoverCanvas(x, y) {
        hoverCalls.push({ x, y });
      },
      async setAttackPercent(value) {
        sliderCalls.push(value);
      },
      async wait() {},
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      probeTargets: true,
      targetProbeCount: 2,
      targetProbeMs: 1,
      maxSelectedAttackRatio: 0.2,
      lowAttackSlider: 0.35,
      attackPercentWaitMs: 1,
    },
  );

  const action = await strategy.nextAction(context);
  const probes = context.decisionSamples[0].targetProbes;

  assert.equal(action.type, "click");
  assert.deepEqual(sliderCalls, [0.35]);
  assert.equal(hoverCalls.length, 4);
  assert.equal(action.meta.reprobeAttackSlider, 0.35);
  assert.equal(action.meta.reprobeReason, "unsafe-selected-attack-ratio");
  assert.equal(action.meta.targetProbePasses, 2);
  assert.equal(probes.filter((probe) => probe.probePass === "initial").every((probe) => probe.attackCostSafe === false), true);
  assert.equal(probes.filter((probe) => probe.probePass === "low-attack-reprobe").every((probe) => probe.attackCostSafe === true), true);
  assert.equal(context.decisionSamples[0].targetChoice.reason, "probe-labeled-target");
});

test("AdaptiveCustomScenarioStrategy recovers normal attack slider after sampled progress", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  strategy.currentAttackSlider = 0.35;
  strategy.territoryProgress = { ownedCellCount: 2, stallStreak: 0 };
  const hoverCalls = [];
  const sliderCalls = [];
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
              ...(hoverCalls.length ? [{ text: "300 (20%)" }] : []),
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
      async hoverCanvas(x, y) {
        hoverCalls.push({ x, y });
      },
      async setAttackPercent(value) {
        sliderCalls.push(value);
      },
      async wait() {},
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      probeTargets: true,
      adaptiveAttackSizing: true,
      targetProbeCount: 1,
      targetProbeMs: 1,
      lowAttackSlider: 0.35,
      maxSelectedAttackRatio: 0.34,
      attackPercentWaitMs: 1,
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "attackClick");
  assert.deepEqual(sliderCalls, [0.455]);
  assert.equal(hoverCalls.length, 1);
  assert.equal(action.attackPercent, 0.455);
  assert.equal(action.meta.attackSizeReason, "normal-attack-size");
  assert.deepEqual(action.meta.attackSliderRecovery, {
    reason: "post-progress-normalize",
    from: 0.35,
    to: 0.455,
    ownedCellGrowth: 2,
  });
  assert.deepEqual(context.decisionSamples[0].action.meta.attackSliderRecovery, action.meta.attackSliderRecovery);
});

test("AdaptiveCustomScenarioStrategy can keep low slider until progress recovery is allowed", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  strategy.currentAttackSlider = 0.35;
  strategy.territoryProgress = { ownedCellCount: 2, stallStreak: 0 };
  const hoverCalls = [];
  const sliderCalls = [];
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
              ...(hoverCalls.length ? [{ text: "300 (20%)" }] : []),
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
      async hoverCanvas(x, y) {
        hoverCalls.push({ x, y });
      },
      async setAttackPercent(value) {
        sliderCalls.push(value);
      },
      async wait() {},
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      probeTargets: true,
      adaptiveAttackSizing: true,
      targetProbeCount: 1,
      targetProbeMs: 1,
      lowAttackSlider: 0.35,
      maxSelectedAttackRatio: 0.34,
      recoverAttackSliderAfterProgress: false,
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "attackClick");
  assert.deepEqual(sliderCalls, []);
  assert.equal(action.attackPercent, 0.35);
  assert.equal(action.meta.attackSliderRecovery, null);
});

test("AdaptiveCustomScenarioStrategy can hover-probe post-opening targets", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const hoverCalls = [];
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
              ...(hoverCalls.length ? [{ text: `${300 + hoverCalls.length * 50} (31%)` }] : []),
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
      async hoverCanvas(x, y) {
        hoverCalls.push({ x, y });
      },
      async wait() {},
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      probeTargets: true,
      targetProbeCount: 2,
      targetProbeMs: 1,
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "click");
  assert.ok(hoverCalls.length > 0);
  assert.equal(context.decisionSamples.length, 1);
  assert.ok(context.decisionSamples[0].targetProbes.length > 0);
  assert.equal(context.decisionSamples[0].targetChoice.reason, "probe-labeled-target");
});

test("AdaptiveCustomScenarioStrategy can adapt attack size before clicking", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const hoverCalls = [];
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
              ...(hoverCalls.length ? [{ text: "360 (45%)" }] : []),
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
      async hoverCanvas(x, y) {
        hoverCalls.push({ x, y });
      },
      async wait() {},
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      probeTargets: true,
      adaptiveAttackSizing: true,
      targetProbeCount: 1,
      targetProbeMs: 1,
      lowAttackSlider: 0.415,
      normalAttackSlider: 0.455,
      maxSelectedAttackPercent: 0.34,
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "attackClick");
  assert.equal(action.attackPercent, 0.415);
  assert.equal(action.meta.attackSizeReason, "cap-selected-attack-percent");
  assert.equal(context.decisionSamples[0].action.attackPercent, 0.415);
});

test("AdaptiveCustomScenarioStrategy can probe map-label targets", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const hoverCalls = [];
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            canvases: [{ width: 1000, height: 800 }],
            texts: [
              { text: "Player 1", x: 500, y: 400, screen: { x: 500, y: 400 }, font: "bold 42px system-ui" },
              { text: "1 500", x: 500, y: 432, screen: { x: 500, y: 432 }, font: "bold 21px system-ui" },
              { text: "Neutral Land", x: 620, y: 420, screen: { x: 620, y: 420 }, font: "bold 26px system-ui" },
              { text: "800", x: 620, y: 452, screen: { x: 620, y: 452 }, font: "bold 21px system-ui" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
              ...(hoverCalls.length ? [{ text: "300 (31%)" }] : []),
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
      async hoverCanvas(x, y) {
        hoverCalls.push({ x, y });
      },
      async wait() {},
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      probeTargets: true,
      targetProbeCount: 1,
      targetProbeMs: 1,
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "click");
  assert.deepEqual(hoverCalls[0], { x: 0.62, y: 0.525 });
  assert.equal(context.decisionSamples[0].targetProbes[0].source, "map-label");
  assert.equal(context.decisionSamples[0].targetProbes[0].label.name, "Neutral Land");
});

test("AdaptiveCustomScenarioStrategy can use a local policy target ranker", async () => {
  const strategy = new AdaptiveCustomScenarioStrategy();
  strategy.phase = "expand";
  strategy.expansionClicks = 3;
  const context = new StrategyContext(
    {
      async snapshot() {
        return {
          state: {
            texts: [
              { text: "Player 1" },
              { text: "1 500" },
              { text: "Interest" },
              { text: "7.00%" },
              { text: "Time" },
              { text: "0:15" },
            ],
          },
        };
      },
      async sampleCanvasGrid() {
        return makeProbeGrid();
      },
    },
    {
      maxExpansionClicks: 3,
      midgameStartSeconds: 0,
      resumeInterest: 0,
      minInterest: 0,
      hardMinInterest: 0,
      policyCandidateCount: 100,
      policy: {
        kind: "territorial-linear-target-ranker",
        weights: {
          bias: 0,
          sourceFallback: 10,
        },
      },
    },
  );

  const action = await strategy.nextAction(context);

  assert.equal(action.type, "click");
  assert.deepEqual({ x: action.x, y: action.y }, { x: 0.5, y: 0.38 });
  assert.equal(action.meta.policyScore, 10);
  assert.equal(context.decisionSamples[0].targetChoice.reason, "policy-target");
});

test("summarizeBotRun counts actions, wait reasons, and phases", () => {
  const summary = summarizeBotRun({
    mode: "custom-adaptive",
    durationMs: 12000,
    tickMs: 600,
    telemetry: {
      ownRank: 84,
      ownVisibleTroops: 1250,
      players: 512,
      interest: 0.065,
      percentage: 0.001,
      income: 12,
    },
    log: [
      { at: 1000, action: { type: "click", meta: { phase: "opening-frontier" } } },
      { at: 1600, action: { type: "wait", meta: { reason: "opening-budget" } } },
      { at: 2200, action: { type: "click", meta: { phase: "midgame-region" } } },
    ],
    options: {
      openingPercent: 0.39,
      spawn: { x: 0.63, y: 0.78 },
      maxExpansionClicks: 3,
      minAttackTroops: 1200,
      maxSelectedAttackRatio: 0.34,
      maxOpponentTroopRatio: 0.65,
      reprobeLowAttackOnUnsafeCost: true,
      recoverAttackSliderAfterProgress: true,
      stallBackoff: true,
      maxStallStreak: 3,
      minOwnedCellGrowth: 1,
      failedTargetCooldown: 5,
      failedTargetDistance: 0.09,
      minSuccessfulTargetGrowth: 1,
    },
    decisionSamples: [
      { targetProbes: [{}, {}] },
      {},
    ],
  });

  assert.equal(summary.actions.total, 3);
  assert.equal(summary.actions.counts.click, 2);
  assert.equal(summary.waitsByReason["opening-budget"], 1);
  assert.equal(summary.phases["midgame-region"], 1);
  assert.equal(summary.decisionSamples.total, 2);
  assert.equal(summary.decisionSamples.withTargetProbes, 1);
  assert.equal(summary.decisionSamples.targetProbeCount, 2);
  assert.deepEqual(summary.options.spawn, { x: 0.63, y: 0.78 });
  assert.deepEqual(summary.placement, {
    rank: 84,
    players: 512,
    percentile: 0.837891,
    rankFraction: 0.164063,
    top10: false,
    top25: true,
    top50: true,
  });
  assert.equal(summary.options.minAttackTroops, 1200);
  assert.equal(summary.options.maxSelectedAttackRatio, 0.34);
  assert.equal(summary.options.maxOpponentTroopRatio, 0.65);
  assert.equal(summary.options.reprobeLowAttackOnUnsafeCost, true);
  assert.equal(summary.options.recoverAttackSliderAfterProgress, true);
  assert.equal(summary.options.stallBackoff, true);
  assert.equal(summary.options.maxStallStreak, 3);
  assert.equal(summary.options.minOwnedCellGrowth, 1);
  assert.equal(summary.options.failedTargetCooldown, 5);
  assert.equal(summary.options.failedTargetDistance, 0.09);
  assert.equal(summary.options.minSuccessfulTargetGrowth, 1);
  assert.ok(summary.score > 0);
});

test("summarizeRunArtifacts aggregates runs, probes, and map labels", () => {
  const summary = summarizeRunArtifacts([
    {
      dir: "artifacts/run-a",
      runSummary: {
        mode: "custom-adaptive",
        score: 0.4,
        actions: { counts: { click: 2, wait: 1 } },
        waitsByReason: { "opening-budget": 1 },
        phases: { "midgame-region": 1 },
        final: "rank=10 troops=1000",
        finalTelemetry: {
          ownRank: 10,
          players: 100,
          ownVisibleTroops: 1000,
          interest: 0.06,
        },
        options: { openingPercent: 0.39 },
      },
      decisionSamples: [
        {
          telemetry: {
            mapLabels: [
              { name: "Player 1", troops: 1000, x: 0.5, y: 0.5, relation: "own" },
              { name: "Neutral Land", troops: 800, x: 0.62, y: 0.52, relation: "neutral" },
            ],
          },
          targetProbes: [
            {
              source: "map-label",
              selectedAttackTroops: 300,
              selectedAttackPercent: 0.31,
              selectedAttackRatio: 0.3,
              attackCostSafe: true,
              probePass: "low-attack-reprobe",
              safe: true,
              label: { name: "Neutral Land", relation: "neutral" },
            },
          ],
          targetChoice: { reason: "probe-labeled-target" },
          action: {
            meta: {
              attackSizeReason: "normal-attack-size",
              reprobeReason: "unsafe-selected-attack-ratio",
              reprobeAttackSlider: 0.35,
              attackSliderRecovery: {
                reason: "post-progress-normalize",
                from: 0.35,
                to: 0.455,
                ownedCellGrowth: 2,
              },
              ownedCellGrowth: 2,
              territoryStallStreak: 0,
              failedTargetCount: 0,
              avoidedTargetCount: 0,
            },
          },
        },
        {
          telemetry: {
            mapLabels: [],
          },
          targetProbes: [],
          targetChoice: null,
          action: {
            meta: {
              reason: "territory-stall-backoff",
              ownedCellGrowth: 0,
              territoryStallStreak: 3,
              rememberedFailedTarget: { x: 0.7, y: 0.5 },
              failedTargetCount: 1,
              avoidedTargetCount: 1,
            },
          },
        },
      ],
    },
    {
      dir: "artifacts/run-b",
      runSummary: {
        mode: "custom-adaptive",
        score: 0.2,
        actions: { counts: { click: 1 } },
        phases: { "opening-frontier": 1 },
        finalTelemetry: {
          ownRank: 20,
          players: 100,
          ownVisibleTroops: 500,
          interest: 0.04,
        },
      },
      decisionSamples: [],
    },
  ]);

  assert.equal(summary.runs.total, 2);
  assert.equal(summary.runs.byMode["custom-adaptive"], 2);
  assert.equal(summary.score.mean, 0.3);
  assert.equal(summary.finalTelemetry.bestRank, 10);
  assert.equal(summary.placement.meanPercentile, 0.86);
  assert.equal(summary.placement.bestPercentile, 0.91);
  assert.equal(summary.placement.meanRank, 15);
  assert.equal(summary.placement.bestRank, 10);
  assert.equal(summary.placement.top10Rate, 0.5);
  assert.equal(summary.placement.top25Rate, 1);
  assert.equal(summary.placement.top50Rate, 1);
  assert.equal(summary.finalTelemetry.meanTroops, 750);
  assert.equal(summary.actions.click, 3);
  assert.equal(summary.targetProbes.total, 1);
  assert.equal(summary.targetProbes.withSelectedAttackLabel, 1);
  assert.equal(summary.targetProbes.attackCostSafe, 1);
  assert.equal(summary.targetProbes.attackCostUnsafe, 0);
  assert.equal(summary.targetProbes.meanSelectedAttackRatio, 0.3);
  assert.equal(summary.targetProbes.byPass["low-attack-reprobe"], 1);
  assert.equal(summary.targetProbes.withMapLabel, 1);
  assert.equal(summary.mapLabels.nonOwn, 1);
  assert.equal(summary.attackSizing.byReason["normal-attack-size"], 1);
  assert.equal(summary.attackSizing.recoveries, 1);
  assert.equal(summary.attackSizing.recoveryByReason["post-progress-normalize"], 1);
  assert.equal(summary.reprobe.lowAttackReprobes, 1);
  assert.equal(summary.reprobe.byReason["unsafe-selected-attack-ratio"], 1);
  assert.equal(summary.progress.territoryStallBackoffs, 1);
  assert.equal(summary.progress.meanOwnedCellGrowth, 1);
  assert.equal(summary.progress.maxTerritoryStallStreak, 3);
  assert.equal(summary.targetMemory.failedTargetsRemembered, 1);
  assert.equal(summary.targetMemory.meanAvoidedTargetCount, 0.5);
  assert.equal(summary.targetMemory.maxFailedTargetCount, 1);
  assert.equal(summary.bestRuns[0].dir, "artifacts/run-a");
});

test("buildTuneConfigs creates tactical sweep matrices and stable labels", () => {
  const configs = buildTuneConfigs({
    "opening-percent-list": "0.39",
    "expansion-clicks-list": "3",
    "max-selected-attack-ratio-list": "0.13,0.2",
    "low-attack-slider-list": "0.35",
    "target-probe-count-list": "2,4",
    "reprobe-low-attack-on-unsafe-cost-list": "true,false",
  });
  const first = configs[0];
  const flags = tuneConfigToFlags(first);

  assert.equal(configs.length, 8);
  assert.deepEqual(first, {
    openingPercent: 0.39,
    maxExpansionClicks: 3,
    maxSelectedAttackRatio: 0.13,
    lowAttackSlider: 0.35,
    targetProbeCount: 2,
    reprobeLowAttackOnUnsafeCost: true,
  });
  assert.equal(formatTuneConfigLabel(first), "p0_39-n3-cost0_13-low0_35-probe2-reprobeon");
  assert.deepEqual(flags, {
    "opening-percent": "0.39",
    "max-expansion-clicks": "3",
    "max-selected-attack-ratio": "0.13",
    "low-attack-slider": "0.35",
    "target-probe-count": "2",
    "reprobe-low-attack-on-unsafe-cost": "true",
  });
});

test("buildTuneConfigs can tune explicit normalized spawn points", () => {
  const configs = buildTuneConfigs({
    "opening-percent-list": "0.39",
    "expansion-clicks-list": "3",
    "spawn-list": "0.63:0.78,0.54x0.74",
  });
  const scalar = buildTuneConfigs({
    "opening-percent-list": "0.39",
    "expansion-clicks-list": "3",
    "spawn-x": "0.62",
    "spawn-y": "0.73",
  })[0];

  assert.equal(configs.length, 2);
  assert.deepEqual(configs[0].spawn, { x: 0.63, y: 0.78 });
  assert.deepEqual(configs[1].spawn, { x: 0.54, y: 0.74 });
  assert.equal(formatTuneConfigLabel(configs[0]), "p0_39-n3-spawn0_63x0_78");
  assert.deepEqual(tuneConfigToFlags(configs[0]), {
    "opening-percent": "0.39",
    "max-expansion-clicks": "3",
    "spawn-x": "0.63",
    "spawn-y": "0.78",
  });
  assert.deepEqual(scalar.spawn, { x: 0.62, y: 0.73 });
  assert.throws(
    () => buildTuneConfigs({ "spawn-list": "0.63,0.78" }),
    /Invalid spawn pair/,
  );
});

test("buildTuneConfigs can tune pacing thresholds", () => {
  const configs = buildTuneConfigs({
    "opening-percent-list": "0.39",
    "expansion-clicks-list": "3",
    "min-interest-list": "0,0.045",
    "resume-interest-list": "0.061,0.066",
    "midgame-start-seconds-list": "0,8",
  });
  const first = configs[0];

  assert.equal(configs.length, 8);
  assert.deepEqual(first, {
    openingPercent: 0.39,
    maxExpansionClicks: 3,
    minInterest: 0,
    resumeInterest: 0.061,
    midgameStartSeconds: 0,
  });
  assert.equal(formatTuneConfigLabel(first), "p0_39-n3-min0-resume0_061-mid0");
  assert.deepEqual(tuneConfigToFlags(first), {
    "opening-percent": "0.39",
    "max-expansion-clicks": "3",
    "min-interest": "0",
    "resume-interest": "0.061",
    "midgame-start-seconds": "0",
  });
});

test("buildTuneConfigs can tune opponent troop caps", () => {
  const configs = buildTuneConfigs({
    "opening-percent-list": "0.39",
    "expansion-clicks-list": "3",
    "max-opponent-troop-ratio-list": "0.55,0.65",
  });

  assert.equal(configs.length, 2);
  assert.deepEqual(configs[0], {
    openingPercent: 0.39,
    maxExpansionClicks: 3,
    maxOpponentTroopRatio: 0.55,
  });
  assert.equal(formatTuneConfigLabel(configs[0]), "p0_39-n3-opp0_55");
  assert.deepEqual(tuneConfigToFlags(configs[0]), {
    "opening-percent": "0.39",
    "max-expansion-clicks": "3",
    "max-opponent-troop-ratio": "0.55",
  });
});

test("rankTuneResults sorts highest mean score first", () => {
  const ranked = rankTuneResults([
    { label: "a", meanScore: 0.1, meanPlacementPercentile: 0.9, meanRank: 10 },
    { label: "b", meanScore: 0.3, meanPlacementPercentile: 0.4, meanRank: 60 },
    { label: "c", meanScore: 0.2, meanPlacementPercentile: 0.8, meanRank: 20 },
  ]);

  assert.deepEqual(ranked.map((result) => result.label), ["b", "c", "a"]);
});

test("rankTuneResults can rank by placement or rank objective", () => {
  const results = [
    { label: "score-heavy", meanScore: 0.8, meanPlacementPercentile: 0.4, meanRank: 60, top10Rate: 0 },
    { label: "placement-heavy", meanScore: 0.5, meanPlacementPercentile: 0.85, meanRank: 12, top10Rate: 0.5 },
    { label: "rank-best", meanScore: 0.4, meanPlacementPercentile: 0.8, meanRank: 10, top10Rate: 1 },
  ];

  assert.deepEqual(rankTuneResults(results, { objective: "score" }).map((result) => result.label), [
    "score-heavy",
    "placement-heavy",
    "rank-best",
  ]);
  assert.deepEqual(rankTuneResults(results, { objective: "placement" }).map((result) => result.label), [
    "placement-heavy",
    "rank-best",
    "score-heavy",
  ]);
  assert.deepEqual(rankTuneResults(results, { objective: "rank" }).map((result) => result.label), [
    "rank-best",
    "placement-heavy",
    "score-heavy",
  ]);
  assert.equal(normalizeTuneObjective("PLACEMENT"), "placement");
  assert.throws(() => normalizeTuneObjective("wins"), /Unknown tune objective/);
});

test("summarizeTuneGames aggregates placement rates from evaluation entries", () => {
  const games = [
    {
      game: 1,
      score: 0.2,
      finalTelemetry: { ownRank: 5, players: 100 },
    },
    {
      game: 2,
      score: 0.4,
      placement: {
        rank: 50,
        players: 100,
        percentile: 0.51,
        rankFraction: 0.5,
        top10: false,
        top25: false,
        top50: true,
      },
    },
  ];
  const summary = summarizeTuneGames(games);

  assert.deepEqual(summary, {
    meanScore: 0.3,
    bestScore: 0.4,
    worstScore: 0.2,
    meanPlacementPercentile: 0.735,
    bestPlacementPercentile: 0.96,
    meanRank: 27.5,
    bestRank: 5,
    top10Rate: 0.5,
    top25Rate: 0.5,
    top50Rate: 1,
  });
  assert.deepEqual(rankEvaluationGames(games, { objective: "rank" }).map((game) => game.game), [1, 2]);
});

test("config profiles normalize tune configs and merge CLI overrides", () => {
  const profile = normalizeConfigProfile({
    name: "smoke-profile",
    flags: {
      "probe-targets": true,
      "duration-ms": 12000,
    },
    config: {
      openingPercent: 0.415,
      maxExpansionClicks: 2,
      spawn: { x: 0.63, y: 0.78 },
      minInterest: 0,
      resumeInterest: 0.061,
      midgameStartSeconds: 8,
      maxSelectedAttackRatio: 0.13,
      maxOpponentTroopRatio: 0.65,
      lowAttackSlider: 0.35,
      targetProbeCount: 3,
      reprobeLowAttackOnUnsafeCost: true,
    },
  });
  const merged = mergeConfigFlags({
    config: "profiles/smoke.json",
    "duration-ms": "8000",
  }, profile);

  assert.equal(profile.name, "smoke-profile");
  assert.deepEqual(profile.flags, {
    "probe-targets": "true",
    "duration-ms": "12000",
    "opening-percent": "0.415",
    "max-expansion-clicks": "2",
    "spawn-x": "0.63",
    "spawn-y": "0.78",
    "min-interest": "0",
    "resume-interest": "0.061",
    "midgame-start-seconds": "8",
    "max-selected-attack-ratio": "0.13",
    "max-opponent-troop-ratio": "0.65",
    "low-attack-slider": "0.35",
    "target-probe-count": "3",
    "reprobe-low-attack-on-unsafe-cost": "true",
  });
  assert.equal(merged.config, undefined);
  assert.equal(merged["duration-ms"], "8000");
  assert.equal(merged["opening-percent"], "0.415");
});

test("buildBestTuneProfile writes a reusable profile from the top tune result", () => {
  const profile = buildBestTuneProfile({
    label: "p0_415-n2-cost0_13-low0_35-probe3-reprobeon",
    tuneObjective: "placement",
    meanScore: 0.52,
    meanPlacementPercentile: 0.83,
    meanRank: 87,
    top10Rate: 0.25,
    games: 2,
    best: {
      runSummary: {
        options: {
          probeTargets: true,
          adaptiveAttackSizing: true,
          resumeInterest: 0,
          minInterest: 0,
          midgameStartSeconds: 8,
          targetProbeMs: 120,
          recoverAttackSliderAfterProgress: true,
          spawn: { x: 0.63, y: 0.78 },
          maxOpponentTroopRatio: 0.65,
        },
      },
    },
    openingPercent: 0.415,
    maxExpansionClicks: 2,
    spawn: { x: 0.63, y: 0.78 },
    minInterest: 0,
    resumeInterest: 0,
    midgameStartSeconds: 8,
    maxSelectedAttackRatio: 0.13,
    maxOpponentTroopRatio: 0.65,
    lowAttackSlider: 0.35,
    targetProbeCount: 3,
    reprobeLowAttackOnUnsafeCost: true,
  }, {
    sourcePath: "artifacts/tune/tune-summary.json",
    createdAt: "2026-06-09T00:00:00.000Z",
  });

  assert.equal(profile.source.type, "tune-summary");
  assert.equal(profile.source.path, "artifacts/tune/tune-summary.json");
  assert.equal(profile.source.objective, "placement");
  assert.equal(profile.source.meanScore, 0.52);
  assert.equal(profile.source.meanPlacementPercentile, 0.83);
  assert.equal(profile.source.meanRank, 87);
  assert.equal(profile.source.top10Rate, 0.25);
  assert.deepEqual(profile.config, {
    openingPercent: 0.415,
    maxExpansionClicks: 2,
    spawn: { x: 0.63, y: 0.78 },
    minInterest: 0,
    resumeInterest: 0,
    midgameStartSeconds: 8,
    maxSelectedAttackRatio: 0.13,
    maxOpponentTroopRatio: 0.65,
    lowAttackSlider: 0.35,
    targetProbeCount: 3,
    reprobeLowAttackOnUnsafeCost: true,
  });
  assert.deepEqual(profile.flags, {
    "probe-targets": "true",
    "adaptive-attack-sizing": "true",
    "resume-interest": "0",
    "min-interest": "0",
    "midgame-start-seconds": "8",
    "target-probe-ms": "120",
    "recover-attack-slider-after-progress": "true",
    "spawn-x": "0.63",
    "spawn-y": "0.78",
    "opening-percent": "0.415",
    "max-expansion-clicks": "2",
    "max-selected-attack-ratio": "0.13",
    "max-opponent-troop-ratio": "0.65",
    "low-attack-slider": "0.35",
    "target-probe-count": "3",
    "reprobe-low-attack-on-unsafe-cost": "true",
  });
});

function makeProbeGrid() {
  const grid = {
    width: 100,
    height: 100,
    cols: 10,
    rows: 10,
    samples: [],
  };
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const owned = col >= 4 && col <= 5 && row >= 4 && row <= 5;
      const blueRegion = col >= 6 && col <= 7 && row >= 4 && row <= 5;
      grid.samples.push({
        col,
        row,
        x: col * 10 + 5,
        y: row * 10 + 5,
        rgba: owned ? [100, 50, 20, 255] : blueRegion ? [30, 90, 170, 255] : [180, 210, 3, 255],
      });
    }
  }
  return grid;
}
