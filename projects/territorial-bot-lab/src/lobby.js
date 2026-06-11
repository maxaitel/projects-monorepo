import path from "node:path";
import { targets } from "./targets.js";

export const lobbyRoutes = {
  main: [],
  multiplayer: [
    { type: "clickCanvas", label: "main-menu-multiplayer", target: targets.mainMenu.multiplayer },
  ],
  "game-menu": [
    { type: "clickCanvas", label: "main-menu-game-menu", target: targets.mainMenu.gameMenu },
  ],
  "join-lobby-2": [
    { type: "clickCanvas", label: "main-menu-game-menu", target: targets.mainMenu.gameMenu },
    { type: "clickCanvas", label: "game-menu-join-lobby-2", target: targets.gameMenu.joinLobby2 },
  ],
};

export function lobbyRouteSteps(route = "game-menu") {
  const steps = lobbyRoutes[route];
  if (!steps) {
    throw new Error(`Unknown lobby route: ${route}. Expected one of ${Object.keys(lobbyRoutes).join(", ")}.`);
  }
  return steps;
}

export async function runLobbyProbe(harness, options = {}) {
  const route = options.route ?? "game-menu";
  const steps = lobbyRouteSteps(route);
  const stepWaitMs = options.stepWaitMs ?? 1000;
  const finalWaitMs = options.finalWaitMs ?? 6000;
  const outDir = options.outDir ?? "artifacts/lobby-probe";
  const captures = [];
  const playerName = normalizePlayerName(options.playerName);
  let playerNameSet = false;

  if (playerName) {
    playerNameSet = await harness.setPlayerName(playerName);
    await harness.wait(options.nameWaitMs ?? 250);
  }

  captures.push(await captureLobbyStep(harness, outDir, "00-initial", {
    route,
    action: null,
    playerName,
    playerNameSet,
  }));
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.type === "clickCanvas") {
      await harness.clickCanvas(step.target.x, step.target.y);
    } else {
      throw new Error(`Unsupported lobby probe step: ${step.type}`);
    }
    await harness.wait(stepWaitMs);
    captures.push(await captureLobbyStep(harness, outDir, `${String(index + 1).padStart(2, "0")}-${step.label}`, {
      route,
      action: step,
    }));
  }

  if (finalWaitMs > 0) {
    await harness.wait(finalWaitMs);
    captures.push(await captureLobbyStep(harness, outDir, `${String(steps.length + 1).padStart(2, "0")}-final`, {
      route,
      action: null,
      finalWaitMs,
    }));
  }

  const captureSummaries = captures.map((capture) => capture.summary);
  const summary = {
    route,
    stepWaitMs,
    finalWaitMs,
    playerName,
    playerNameSet,
    captures: captureSummaries,
    assessment: assessLobbyProbe(captureSummaries),
  };
  await harness.writeJson(path.join(outDir, "lobby-probe-summary.json"), summary);
  return summary;
}

export async function runLobbyWatch(harness, options = {}) {
  const route = options.route ?? "join-lobby-2";
  const steps = lobbyRouteSteps(route);
  const stepWaitMs = options.stepWaitMs ?? 1000;
  const watchMs = Math.max(0, options.watchMs ?? 10000);
  const watchTickMs = Math.max(250, options.watchTickMs ?? 1000);
  const outDir = options.outDir ?? "artifacts/lobby-watch";
  const expectedPlayers = normalizeExpectedPlayers(options.expectedPlayers);
  const minPlayers = Math.max(0, options.minPlayers ?? 0);
  const routeCaptures = [];
  const timeline = [];
  const playerName = normalizePlayerName(options.playerName);
  let playerNameSet = false;

  if (playerName) {
    playerNameSet = await harness.setPlayerName(playerName);
    await harness.wait(options.nameWaitMs ?? 250);
  }

  routeCaptures.push(await captureLobbyStep(harness, outDir, "00-initial", {
    route,
    action: null,
    playerName,
    playerNameSet,
  }));
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.type === "clickCanvas") {
      await harness.clickCanvas(step.target.x, step.target.y);
    } else {
      throw new Error(`Unsupported lobby watch step: ${step.type}`);
    }
    await harness.wait(stepWaitMs);
    routeCaptures.push(await captureLobbyStep(harness, outDir, `${String(index + 1).padStart(2, "0")}-${step.label}`, {
      route,
      action: step,
    }));
  }

  const watchStartedAt = Date.now();
  const watchEndsAt = watchStartedAt + watchMs;
  let finalState = null;
  let tick = 0;
  do {
    finalState = await readLobbyState(harness, {
      route,
      watchTick: tick,
      watchStartedAt,
    });
    const elapsedMs = Date.now() - watchStartedAt;
    const readiness = assessLobbyReadiness(finalState.summary, { expectedPlayers, minPlayers });
    timeline.push(compactWatchTick({ tick, elapsedMs, summary: finalState.summary, readiness }));
    if (Date.now() >= watchEndsAt) break;
    await harness.wait(Math.min(watchTickMs, Math.max(0, watchEndsAt - Date.now())));
    tick += 1;
  } while (true);

  const routeSummaries = routeCaptures.map((capture) => capture.summary);
  const watchSummaries = timeline.map((entry) => entry.summary);
  const allSummaries = [...routeSummaries, ...watchSummaries];
  const firstReadyTick = timeline.find((entry) => entry.readiness.readyConditionMet) ?? null;
  const finalReadiness = timeline.at(-1)?.readiness ?? assessLobbyReadiness(null, { expectedPlayers, minPlayers });
  const summary = {
    route,
    stepWaitMs,
    watchMs,
    watchTickMs,
    playerName,
    playerNameSet,
    expectedPlayers,
    minPlayers,
    routeCaptures: routeSummaries,
    timeline,
    assessment: {
      ...assessLobbyProbe(allSummaries),
      watchTicks: timeline.length,
      readyConditionMet: Boolean(firstReadyTick),
      readyAtElapsedMs: firstReadyTick?.elapsedMs ?? null,
      finalReadiness,
      firstReadyPlan: firstReadyTick?.readiness.readyTarget ?? null,
      note: "Dry-run readiness only; this command does not click Ready or control public gameplay.",
    },
  };

  if (finalState) {
    await harness.writeJson(path.join(outDir, "lobby-watch-final-state.json"), finalState);
  }
  await harness.screenshot(path.join(outDir, "lobby-watch-final-page.png"));
  await harness.canvasPng(path.join(outDir, "lobby-watch-final-canvas.png"));
  await harness.writeJson(path.join(outDir, "lobby-watch-summary.json"), summary);
  return summary;
}

export async function captureLobbyStep(harness, outDir, label, metadata = {}) {
  const state = await readLobbyState(harness, metadata, label);
  const base = path.join(outDir, label);
  await harness.writeJson(`${base}.json`, state);
  await harness.screenshot(`${base}-page.png`);
  await harness.canvasPng(`${base}-canvas.png`);
  return state;
}

export async function readLobbyState(harness, metadata = {}, label = metadata.label ?? null) {
  const snapshot = await harness.snapshot();
  const dom = await harness.domSnapshot();
  const network = harness.networkSnapshot();
  const summary = summarizeLobbyState({ snapshot, dom, network, label, metadata });
  return { summary, snapshot, dom, network };
}

export function summarizeLobbyState({ snapshot = {}, dom = {}, network = [], label = null, metadata = {} } = {}) {
  const canvasTexts = (snapshot.state?.texts ?? []).map((entry) => String(entry.text));
  const canvasRecentTexts = canvasTexts.slice(-80);
  const domLines = textLines(dom.bodyText);
  const elementTexts = (dom.elements ?? [])
    .map((element) => element.text || element.value || element.placeholder)
    .filter(Boolean);
  const visibleText = [...canvasRecentTexts, ...elementTexts].join("\n");
  const webSockets = network.filter((entry) => entry.type === "websocket-open");
  const webSocketFrames = network.filter((entry) => entry.type?.startsWith("websocket-frame"));
  const lobby = extractLobbyDetails(dom.elements ?? [], dom.viewport);

  return {
    label,
    metadata,
    url: snapshot.url ?? dom.url ?? null,
    title: snapshot.title ?? dom.title ?? null,
    detectedScreen: detectLobbyScreen({ canvasRecentTexts, domLines, elementTexts }),
    version: latestMatch(canvasTexts, /^\d{1,2}\s+\w+\s+\d{4}\s+\[[^\]]+\]$/),
    hasLoadingText: /(^|\n)Loading($|\n)/i.test(visibleText),
    hasJoinLobbyText: /join lobby/i.test(visibleText),
    hasGameMenuText: /game menu/i.test(visibleText),
    hasLobbyText: lobby.hasLobbyText,
    lobby,
    canvasRecentTexts,
    domLines: domLines.slice(0, 80),
    visibleElements: compactVisibleElements(dom.elements ?? []),
    network: {
      totalEvents: network.length,
      webSocketCount: webSockets.length,
      webSockets: webSockets.map((entry) => ({ id: entry.id, url: entry.url })),
      webSocketFrameCount: webSocketFrames.length,
      recent: network.slice(-40),
    },
  };
}

export function detectLobbyScreen({ canvasRecentTexts = [], domLines = [], elementTexts = [] } = {}) {
  const text = [...canvasRecentTexts, ...elementTexts].join("\n");
  if (hasLobbyMarkers(text)) return "lobby";
  if (/(^|\n)Loading($|\n)/i.test(text)) return "loading";
  if (/multiplayer/i.test(text) && /custom scenario/i.test(text)) return "main-menu";
  if (/join lobby/i.test(text)) return "game-menu";
  if (/game menu/i.test(text) && /(settings|leaderboards|logs|delete data|privacy settings|back)/i.test(text)) return "game-menu";
  if (/choose your start position/i.test(text)) return "spawn-selection";
  if (/players\s*\n.*percentage\s*\n.*interest/i.test(text)) return "in-game";
  return "unknown";
}

export function assessLobbyProbe(captures = []) {
  const final = captures.at(-1) ?? null;
  const reachedGameMenu = captures.some((capture) => capture.detectedScreen === "game-menu");
  const enteredLobby = captures.some((capture) => capture.detectedScreen === "lobby");
  const joinLobbyAvailable = captures.some((capture) => capture.hasJoinLobbyText);
  const readyVisible = captures.some((capture) => capture.lobby?.hasReadyButton);
  const finalLoading = final?.detectedScreen === "loading";
  const stuckLoading = Boolean(finalLoading && !enteredLobby);
  const webSocketCount = final?.network?.webSocketCount ?? 0;
  const webSocketFrameCount = final?.network?.webSocketFrameCount ?? 0;
  const status = enteredLobby
    ? "entered-lobby"
    : stuckLoading
      ? "stuck-loading"
      : reachedGameMenu
        ? "menu-only"
        : "unknown";

  return {
    status,
    finalScreen: final?.detectedScreen ?? null,
    reachedGameMenu,
    joinLobbyAvailable,
    enteredLobby,
    readyVisible,
    stuckLoading,
    webSocketCount,
    webSocketFrameCount,
    playerCount: final?.lobby?.playerCount ?? null,
    readyCount: final?.lobby?.readyCount ?? null,
    readyTarget: final?.lobby?.readyTarget ?? null,
    closeTarget: final?.lobby?.closeTarget ?? null,
    observedServerUrls: Array.from(
      new Set(captures.flatMap((capture) => capture.network?.webSockets?.map((socket) => socket.url) ?? [])),
    ),
  };
}

export function assessLobbyReadiness(summary, options = {}) {
  const expectedPlayers = normalizeExpectedPlayers(options.expectedPlayers);
  const minPlayers = Math.max(0, options.minPlayers ?? 0);
  const lobby = summary?.lobby ?? {};
  const visiblePlayers = lobby.visiblePlayers ?? [];
  const expected = expectedPlayersSeen(visiblePlayers, expectedPlayers);
  const playerCount = lobby.playerCount ?? visiblePlayers.length;
  const inLobby = summary?.detectedScreen === "lobby";
  const readyVisible = Boolean(lobby.hasReadyButton);
  const minPlayersMet = minPlayers === 0 || Number(playerCount) >= minPlayers;
  const expectedPlayersMet = expected.missingExpectedPlayers.length === 0;
  const readyConditionMet = Boolean(inLobby && readyVisible && minPlayersMet && expectedPlayersMet);

  return {
    readyConditionMet,
    reason: readinessReason({
      inLobby,
      readyVisible,
      minPlayersMet,
      expectedPlayersMet,
      expectedPlayers,
      minPlayers,
    }),
    detectedScreen: summary?.detectedScreen ?? null,
    playerCount,
    minPlayers,
    minPlayersMet,
    readyVisible,
    readyTarget: readyVisible ? lobby.readyTarget ?? null : null,
    visiblePlayers,
    expectedPlayers,
    seenExpectedPlayers: expected.seenExpectedPlayers,
    missingExpectedPlayers: expected.missingExpectedPlayers,
  };
}

export function expectedPlayersSeen(visiblePlayers = [], expectedPlayers = []) {
  const expected = normalizeExpectedPlayers(expectedPlayers);
  const visible = visiblePlayers.map((player) => ({
    raw: player,
    normalized: normalizePlayerLabel(player),
  }));
  const seenExpectedPlayers = expected.filter((player) => {
    const normalized = normalizePlayerLabel(player);
    return normalized && visible.some((entry) => playerLabelMatches(entry.normalized, normalized));
  });

  return {
    expectedPlayers: expected,
    seenExpectedPlayers,
    missingExpectedPlayers: expected.filter((player) => !seenExpectedPlayers.includes(player)),
  };
}

export function normalizePlayerLabel(value) {
  return String(value ?? "")
    .replace(/[🟢⚪]/gu, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeExpectedPlayers(value) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(
    new Set(
      values
        .flatMap((item) => String(item ?? "").split(","))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function compactVisibleElements(elements) {
  return elements
    .filter((element) => element.text || element.value || element.placeholder)
    .slice(0, 80)
    .map((element) => ({
      tag: element.tag,
      role: element.role,
      text: element.text,
      value: element.value,
      placeholder: element.placeholder,
      rect: element.rect,
    }));
}

function compactWatchTick({ tick, elapsedMs, summary, readiness }) {
  return {
    tick,
    elapsedMs,
    summary: {
      label: summary.label,
      detectedScreen: summary.detectedScreen,
      hasLoadingText: summary.hasLoadingText,
      hasJoinLobbyText: summary.hasJoinLobbyText,
      hasLobbyText: summary.hasLobbyText,
      lobby: {
        hasReadyButton: summary.lobby?.hasReadyButton ?? false,
        hasCloseButton: summary.lobby?.hasCloseButton ?? false,
        playerCount: summary.lobby?.playerCount ?? null,
        readyCount: summary.lobby?.readyCount ?? null,
        readyTarget: summary.lobby?.readyTarget ?? null,
        closeTarget: summary.lobby?.closeTarget ?? null,
        visiblePlayers: summary.lobby?.visiblePlayers ?? [],
      },
      network: {
        webSocketCount: summary.network?.webSocketCount ?? 0,
        webSocketFrameCount: summary.network?.webSocketFrameCount ?? 0,
        webSockets: summary.network?.webSockets ?? [],
      },
    },
    readiness,
  };
}

function readinessReason(state) {
  if (!state.inLobby) return "not-in-lobby";
  if (!state.readyVisible) return "ready-control-not-visible";
  if (!state.minPlayersMet) return `waiting-for-min-players-${state.minPlayers}`;
  if (!state.expectedPlayersMet && state.expectedPlayers.length > 0) return "waiting-for-expected-players";
  return "ready-condition-met";
}

function playerLabelMatches(visible, expected) {
  if (!visible || !expected) return false;
  if (visible === expected) return true;
  return expected.length >= 3 && visible.includes(expected);
}

function extractLobbyDetails(elements, viewport = null) {
  const texts = elements
    .map((element) => element.text || element.value || element.placeholder)
    .filter(Boolean);
  const joined = texts.join("\n");
  const readyButton = elements.find((element) => /^Ready(\n|$)/i.test(element.text ?? ""));
  const closeButton = elements.find((element) => /^Close$/i.test(element.text ?? ""));
  const playersPanel = elements.find((element) => /^Players\n/i.test(element.text ?? ""));
  const readyCount = readyButton ? firstIntegerAfterLabel(readyButton.text, "Ready") : null;
  const playerCount = playersPanel
    ? firstIntegerAfterLabel(playersPanel.text, "Players")
    : firstIntegerAfterLabel(joined, "Player Count");

  return {
    hasLobbyText: hasLobbyMarkers(joined),
    hasReadyButton: Boolean(readyButton),
    hasCloseButton: Boolean(closeButton),
    hasChatPanel: /^Chat$/im.test(joined),
    hasPlayersPanel: Boolean(playersPanel),
    playerCount,
    readyCount,
    readyTarget: readyButton ? buttonTarget(readyButton, viewport) : null,
    closeTarget: closeButton ? buttonTarget(closeButton, viewport) : null,
    visiblePlayers: visiblePlayerNames(texts).slice(0, 24),
  };
}

function buttonTarget(element, viewport) {
  const rect = element.rect ?? {};
  const x = Number(rect.x) + Number(rect.width) / 2;
  const y = Number(rect.y) + Number(rect.height) / 2;
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  return {
    text: element.text ?? "",
    center: { x, y },
    normalizedViewport: Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? { x: x / width, y: y / height }
      : null,
    rect,
  };
}

function hasLobbyMarkers(text) {
  return /(^|\n)Lobby($|\n)/i.test(text) &&
    /(^|\n)(Close|Ready|Players|Chat)($|\n)/i.test(text);
}

function firstIntegerAfterLabel(text, label) {
  const lines = textLines(text);
  const index = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());
  if (index === -1) return null;
  for (const line of lines.slice(index + 1, index + 4)) {
    const match = line.match(/^\d+$/);
    if (match) return Number.parseInt(match[0], 10);
  }
  return null;
}

function visiblePlayerNames(texts) {
  const names = [];
  for (const text of texts) {
    for (const line of textLines(text)) {
      if (/^(?:[🟢⚪]\s*)?(?:\[[^\]]+\])?Player \d+$/u.test(line) || /^[🟢⚪]\s*\[[^\]]+\].+/u.test(line)) {
        names.push(line);
      }
      for (const match of line.matchAll(/[🟢⚪]\s*(?:\[[^\]]+\])?(?:Player \d+|[^🟢⚪\n]+)/gu)) {
        const name = match[0].trim();
        if (name && !/^MP:/i.test(name)) names.push(name);
      }
    }
  }
  return Array.from(new Set(names));
}

function normalizePlayerName(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 32) : null;
}

function textLines(text) {
  return String(text ?? "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function latestMatch(values, regex) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (regex.test(values[i])) return values[i];
  }
  return null;
}
