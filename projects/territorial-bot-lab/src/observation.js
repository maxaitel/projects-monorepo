import fs from "node:fs/promises";
import path from "node:path";
import { compactTelemetry, compactVisualState } from "./decision-samples.js";
import { extractTelemetry, scoreTelemetry } from "./telemetry.js";
import { decodeCanvasGrid } from "./visual.js";

export async function runObservationRecorder(harness, options = {}) {
  const outDir = options.outDir ?? "artifacts/record";
  const durationMs = Math.max(0, options.durationMs ?? 10000);
  const tickMs = Math.max(100, options.tickMs ?? 1000);
  const cols = Math.max(8, options.visualCols ?? 80);
  const rows = Math.max(8, options.visualRows ?? 50);
  const includeGrid = Boolean(options.includeGrid);
  const labelActions = Boolean(options.labelActions);
  const includePointerMoves = Boolean(options.includePointerMoves);
  const screenshotEvery = Math.max(0, options.screenshotEvery ?? 0);
  const playerName = normalizePlayerName(options.playerName);
  let playerNameSet = false;

  await fs.mkdir(outDir, { recursive: true });

  if (playerName) {
    playerNameSet = await harness.setPlayerName(playerName);
    await harness.wait(options.nameWaitMs ?? 250);
  }

  const samples = [];
  const lines = [];
  const startedAt = Date.now();
  const endAt = startedAt + durationMs;
  let sequence = 0;
  let sinceEventAt = 0;

  do {
    const sample = await collectObservationSample(harness, {
      sequence,
      elapsedMs: Date.now() - startedAt,
      cols,
      rows,
      includeGrid,
      labelActions,
      includePointerMoves,
      sinceEventAt,
      playerName,
    });
    sinceEventAt = maxActionAt(sample.actions, sinceEventAt);
    samples.push(sample);
    lines.push(JSON.stringify(sample));
    if (screenshotEvery > 0 && sequence % screenshotEvery === 0) {
      await harness.screenshot(path.join(outDir, `sample-${String(sequence).padStart(4, "0")}-page.png`));
      await harness.canvasPng(path.join(outDir, `sample-${String(sequence).padStart(4, "0")}-canvas.png`));
    }
    sequence += 1;
    if (Date.now() >= endAt) break;
    await harness.wait(Math.min(tickMs, Math.max(0, endAt - Date.now())));
  } while (true);

  const summary = summarizeObservationSamples(samples, {
    durationMs,
    tickMs,
    visualCols: cols,
    visualRows: rows,
    includeGrid,
    labelActions,
    includePointerMoves,
    playerName,
    playerNameSet,
    startedAt,
    finishedAt: Date.now(),
  });

  await fs.writeFile(path.join(outDir, "observations.ndjson"), `${lines.join("\n")}\n`);
  await harness.writeJson(path.join(outDir, "observation-summary.json"), summary);
  await harness.screenshot(path.join(outDir, "final-page.png"));
  await harness.canvasPng(path.join(outDir, "final-canvas.png"));
  return summary;
}

export async function collectObservationSample(harness, options = {}) {
  const snapshot = await harness.snapshot();
  const network = harness.networkSnapshot();
  const grid = await harness.sampleCanvasGrid({
    cols: options.cols ?? 80,
    rows: options.rows ?? 50,
  });
  return buildObservationSample({ snapshot, network, grid }, options);
}

export function buildObservationSample(input = {}, options = {}) {
  const telemetry = extractTelemetry(input.snapshot, { playerName: options.playerName });
  const center = telemetry.ownCenter ?? options.center;
  const decoded = input.grid
    ? decodeCanvasGrid(input.grid, {
        center,
        maxCandidates: options.maxCandidates,
      })
    : null;
  const webSockets = (input.network ?? []).filter((entry) => entry.type === "websocket-open");
  const webSocketFrames = (input.network ?? []).filter((entry) => entry.type?.startsWith("websocket-frame"));
  const actions = options.labelActions
    ? extractActionLabels(input.snapshot, {
        sinceAt: options.sinceEventAt ?? 0,
        includePointerMoves: options.includePointerMoves,
        maxActions: options.maxActions ?? 50,
      })
    : [];

  return {
    schemaVersion: 1,
    sequence: options.sequence ?? 0,
    at: Date.now(),
    elapsedMs: options.elapsedMs ?? null,
    source: "real-client-observation",
    url: input.snapshot?.url ?? null,
    telemetry: compactTelemetry(telemetry),
    score: scoreTelemetry(telemetry),
    visual: decoded ? compactVisualState(decoded, { maxCandidates: options.maxCandidates ?? 8 }) : null,
    network: {
      totalEvents: input.network?.length ?? 0,
      webSocketCount: webSockets.length,
      webSocketFrameCount: webSocketFrames.length,
      webSockets: webSockets.map((socket) => ({ id: socket.id, url: socket.url })),
    },
    canvas: compactCanvas(input.snapshot),
    drawCounts: input.snapshot?.state?.drawCounts ?? {},
    actions,
    actionSummary: summarizeActions(actions),
    rawGrid: options.includeGrid ? input.grid ?? null : undefined,
  };
}

export function summarizeObservationSamples(samples = [], metadata = {}) {
  const scores = samples.map((sample) => sample.score).filter(Number.isFinite);
  const samplesWithOwnCenter = samples.filter((sample) => sample.telemetry?.ownCenter).length;
  const samplesWithVisual = samples.filter((sample) => sample.visual).length;
  const samplesWithMapLabels = samples.filter((sample) => (sample.telemetry?.mapLabels ?? []).length > 0).length;
  const actionLabels = samples.flatMap((sample) => sample.actions ?? []);
  const playerNames = Array.from(
    new Set(samples.map((sample) => sample.telemetry?.playerName).filter(Boolean)),
  );
  const finalSample = samples.at(-1) ?? null;

  return {
    schemaVersion: 1,
    kind: "observation-recording",
    createdAt: new Date().toISOString(),
    options: {
      durationMs: metadata.durationMs ?? null,
      tickMs: metadata.tickMs ?? null,
      visualCols: metadata.visualCols ?? null,
      visualRows: metadata.visualRows ?? null,
      includeGrid: Boolean(metadata.includeGrid),
      labelActions: Boolean(metadata.labelActions),
      includePointerMoves: Boolean(metadata.includePointerMoves),
      playerName: metadata.playerName ?? null,
      playerNameSet: Boolean(metadata.playerNameSet),
    },
    samples: {
      total: samples.length,
      firstElapsedMs: samples[0]?.elapsedMs ?? null,
      lastElapsedMs: finalSample?.elapsedMs ?? null,
      withOwnCenter: samplesWithOwnCenter,
      withVisual: samplesWithVisual,
      withMapLabels: samplesWithMapLabels,
    },
    actions: summarizeActions(actionLabels),
    score: {
      mean: roundedMean(scores),
      best: roundedMax(scores),
      final: Number.isFinite(finalSample?.score) ? round(finalSample.score) : null,
    },
    playerNames,
    finalTelemetry: finalSample?.telemetry ?? null,
    finalVisual: finalSample?.visual
      ? {
          ownedCellCount: finalSample.visual.ownedCellCount,
          frontierCount: finalSample.visual.frontierCount,
          neighborRegionCount: finalSample.visual.neighborRegionCount,
          recommendedTarget: finalSample.visual.recommendedTarget,
          recommendedRegionTarget: finalSample.visual.recommendedRegionTarget,
        }
      : null,
    network: {
      finalWebSocketCount: finalSample?.network?.webSocketCount ?? 0,
      finalWebSocketFrameCount: finalSample?.network?.webSocketFrameCount ?? 0,
      observedServerUrls: Array.from(
        new Set(samples.flatMap((sample) => sample.network?.webSockets?.map((socket) => socket.url) ?? [])),
      ),
    },
    artifacts: {
      observations: "observations.ndjson",
      summary: "observation-summary.json",
      finalPage: "final-page.png",
      finalCanvas: "final-canvas.png",
    },
    note: "Real-client observation only; optional action labels are local UI events and this recorder does not send gameplay protocol messages or click public lobby controls.",
  };
}

export function extractActionLabels(snapshot, options = {}) {
  const sinceAt = options.sinceAt ?? 0;
  const includePointerMoves = Boolean(options.includePointerMoves);
  const maxActions = Math.max(1, options.maxActions ?? 50);
  const canvas = snapshot?.state?.canvases?.[0] ?? null;
  const rect = canvas?.rect ?? null;
  const events = snapshot?.state?.events ?? [];
  return events
    .filter((event) => Number(event.at) > sinceAt)
    .filter((event) => includeActionEvent(event, includePointerMoves))
    .slice(-maxActions)
    .map((event) => compactActionEvent(event, rect));
}

export function summarizeActions(actions = []) {
  const byType = {};
  let canvasActions = 0;
  for (const action of actions) {
    byType[action.type] = (byType[action.type] ?? 0) + 1;
    if (action.canvas?.inside) canvasActions += 1;
  }
  return {
    total: actions.length,
    byType,
    canvasActions,
  };
}

function compactCanvas(snapshot) {
  const canvas = snapshot?.state?.canvases?.[0] ?? null;
  if (!canvas) return null;
  return {
    width: canvas.width ?? null,
    height: canvas.height ?? null,
    clientWidth: canvas.clientWidth ?? null,
    clientHeight: canvas.clientHeight ?? null,
  };
}

function includeActionEvent(event, includePointerMoves) {
  if (event.type === "pointermove") return includePointerMoves;
  return ["click", "pointerdown", "pointerup", "keydown"].includes(event.type);
}

function compactActionEvent(event, rect) {
  const screen = Number.isFinite(event.x) && Number.isFinite(event.y)
    ? { x: event.x, y: event.y }
    : null;
  return {
    at: event.at ?? null,
    type: event.type ?? null,
    button: Number.isFinite(event.button) ? event.button : null,
    key: event.type === "keydown" ? event.key ?? null : null,
    screen,
    canvas: normalizedCanvasPoint(event, rect),
  };
}

function normalizedCanvasPoint(event, rect) {
  if (!rect || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return null;
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const x = (event.x - Number(rect.x)) / width;
  const y = (event.y - Number(rect.y)) / height;
  return {
    x,
    y,
    inside: x >= 0 && x <= 1 && y >= 0 && y <= 1,
  };
}

function maxActionAt(actions = [], fallback = 0) {
  return actions.reduce((max, action) => Math.max(max, Number(action.at) || 0), fallback);
}

function normalizePlayerName(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 32) : null;
}

function roundedMean(values) {
  if (values.length === 0) return null;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function roundedMax(values) {
  if (values.length === 0) return null;
  return round(Math.max(...values));
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
