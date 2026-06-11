export function extractTelemetry(snapshot, options = {}) {
  const texts = snapshot?.state?.texts ?? [];
  const values = texts.map((entry) => String(entry.text));
  const recentValues = values.slice(-80);
  const playerNameHint = normalizePlayerNameHint(options.playerName ?? options.knownPlayerName);
  const inferredPlayerName = latestMatch(values, /^Player \d+$/);
  const playerName = choosePlayerName(values, playerNameHint, inferredPlayerName);
  const leaderboard = parseLeaderboard(recentValues);
  const ownLeaderboardRow = playerName
    ? leaderboard.find((row) => row.name === playerName) ?? null
    : null;
  const selectedAttack = latestSelectedAttack(recentValues);
  const mapLabels = extractMapLabels(snapshot, { playerName, leaderboard });
  const ownLabel = playerName
    ? mapLabels.find((label) => label.name === playerName) ?? latestOwnMapLabel(snapshot, playerName)
    : null;

  return {
    url: snapshot?.url ?? null,
    version: latestMatch(values, /^\d{1,2}\s+\w+\s+\d{4}\s+\[[^\]]+\]$/),
    playerName,
    ownRank: ownLeaderboardRow?.rank ?? null,
    ownLeaderboardScore: ownLeaderboardRow?.score ?? null,
    ownVisibleTroops: playerName ? latestTroopsForPlayer(values, playerName) : null,
    leaderboard,
    players: numericAfterLabel(values, "Players"),
    percentage: percentAfterLabel(values, "Percentage"),
    interest: percentAfterLabel(values, "Interest"),
    income: numericAfterLabel(values, "Income"),
    time: latestMatch(values, /^\d+:\d{2}$/),
    selectedAttack,
    selectedAttackTroops: selectedAttack?.troops ?? null,
    selectedAttackPercent: selectedAttack?.percent ?? null,
    selectedTarget: selectedAttack,
    selectedTargetTroops: selectedAttack?.troops ?? null,
    selectedTargetPercent: selectedAttack?.percent ?? null,
    mapLabels,
    ownLabel,
    ownCenter: ownLabel ? { x: ownLabel.nx, y: ownLabel.ny } : null,
    choosingStart: recentValues.includes("Choose your start position!"),
    map: valueAfterLabel(values, "Map:") ?? latestMap(values),
    latestTexts: values.slice(-40),
  };
}

function choosePlayerName(values, playerNameHint, inferredPlayerName) {
  if (playerNameHint && values.includes(playerNameHint)) return playerNameHint;
  return inferredPlayerName ?? playerNameHint ?? null;
}

function normalizePlayerNameHint(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 32) : null;
}

export function parseTimeSeconds(time) {
  if (!time) return null;
  const match = String(time).match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

export function scoreTelemetry(telemetry) {
  const rank = telemetry.ownRank ?? telemetry.players ?? 999;
  const players = telemetry.players ?? 512;
  const rankScore = Math.max(0, (players - rank + 1) / players);
  const landScore = (telemetry.percentage ?? 0) * 300;
  const interestScore = telemetry.interest ?? 0;
  const incomeScore = Math.log10(Math.max(1, telemetry.income ?? 0)) / 10;
  const troopScore = Math.log10(Math.max(1, telemetry.ownVisibleTroops ?? 0)) / 20;
  return rankScore + landScore + interestScore + incomeScore + troopScore;
}

export function summarizePlacement(telemetry = {}) {
  const rank = finitePositive(telemetry.ownRank);
  const players = finitePositive(telemetry.players);
  const percentile = rank !== null && players !== null
    ? roundMetric(Math.max(0, Math.min(1, (players - rank + 1) / players)))
    : null;
  const rankFraction = rank !== null && players !== null
    ? roundMetric(rank / players)
    : null;

  return {
    rank,
    players,
    percentile,
    rankFraction,
    top10: topPercent(rank, players, 0.1),
    top25: topPercent(rank, players, 0.25),
    top50: topPercent(rank, players, 0.5),
  };
}

export function summarizeTelemetry(telemetry) {
  return {
    playerName: telemetry.playerName,
    rank: telemetry.ownRank,
    players: telemetry.players,
    leaderboardScore: telemetry.ownLeaderboardScore,
    visibleTroops: telemetry.ownVisibleTroops,
    percentage: telemetry.percentage,
    interest: telemetry.interest,
    income: telemetry.income,
    time: telemetry.time,
    selectedAttack: telemetry.selectedAttack ?? telemetry.selectedTarget,
    mapLabels: telemetry.mapLabels,
    placement: summarizePlacement(telemetry),
    score: scoreTelemetry(telemetry),
  };
}

function topPercent(rank, players, fraction) {
  if (rank === null || players === null) return null;
  return rank <= Math.max(1, Math.ceil(players * fraction));
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function roundMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : null;
}

function latestMatch(values, regex) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (regex.test(values[i])) return values[i];
  }
  return null;
}

function latestMap(values) {
  for (let i = 0; i < values.length - 1; i += 1) {
    if (values[i] === "MAP:") return values[i + 1];
  }
  return null;
}

function parseLeaderboard(values) {
  const rows = [];
  for (let index = 0; index < values.length - 2; index += 1) {
    const rankMatch = values[index].match(/^(\d+)\.$/);
    if (!rankMatch) continue;
    const score = parseNumeric(values[index + 2]);
    if (score === null) continue;
    rows.push({
      rank: Number.parseInt(rankMatch[1], 10),
      name: values[index + 1],
      score,
    });
  }

  const byRank = new Map();
  for (const row of rows) byRank.set(row.rank, row);
  return Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);
}

function latestTroopsForPlayer(values, playerName) {
  let best = null;
  for (let index = 0; index < values.length - 1; index += 1) {
    if (values[index] !== playerName) continue;
    const value = parseNumeric(values[index + 1]);
    if (value === null) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

function valueAfterLabel(values, label) {
  for (let i = values.length - 2; i >= 0; i -= 1) {
    if (values[i] === label) return values[i + 1];
  }
  return null;
}

function numericAfterLabel(values, label) {
  const value = valueAfterLabel(values, label);
  if (value === null) return null;
  return parseNumeric(value);
}

function percentAfterLabel(values, label) {
  const value = valueAfterLabel(values, label);
  if (value === null) return null;
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)%$/);
  return match ? Number.parseFloat(match[1]) / 100 : null;
}

function latestSelectedAttack(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const match = values[i].match(/^([\d\s]+)\s+\(([0-9]+(?:\.[0-9]+)?)%\)$/);
    if (!match) continue;
    const troops = parseNumeric(match[1]);
    if (troops === null) continue;
    return {
      troops,
      percent: Number.parseFloat(match[2]) / 100,
      label: values[i],
    };
  }
  return null;
}

function latestOwnMapLabel(snapshot, playerName) {
  const canvas = snapshot?.state?.canvases?.[0] ?? null;
  const width = canvas?.width ?? canvas?.clientWidth ?? null;
  const height = canvas?.height ?? canvas?.clientHeight ?? null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const labels = (snapshot?.state?.texts ?? [])
    .filter((entry) => String(entry.text) === playerName)
    .map((entry) => {
      const x = Number(entry.screen?.x ?? entry.x);
      const y = Number(entry.screen?.y ?? entry.y);
      const nx = x / width;
      const ny = y / height;
      return {
        at: entry.at ?? null,
        x,
        y,
        nx,
        ny,
        font: entry.font ?? null,
        fillStyle: entry.fillStyle ?? null,
        fontSize: fontSize(entry.font),
      };
    })
    .filter((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y))
    .filter((entry) => entry.nx >= 0.24 && entry.nx <= 0.92 && entry.ny >= 0.05 && entry.ny <= 0.88)
    .filter((entry) => entry.fontSize === null || entry.fontSize >= 20)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

  if (!labels.length) return null;
  const { at, x, y, nx, ny, font, fillStyle, fontSize: size } = labels[0];
  return { at, x, y, nx, ny, font, fillStyle, fontSize: size };
}

export function extractMapLabels(snapshot, options = {}) {
  const playerName = options.playerName ?? null;
  const opponentNames = new Set([
    ...(options.opponentNames ?? []),
    ...(options.leaderboard ?? []).map((row) => row.name),
  ].filter((name) => name && name !== playerName));
  const canvas = snapshot?.state?.canvases?.[0] ?? null;
  const width = canvas?.width ?? canvas?.clientWidth ?? null;
  const height = canvas?.height ?? canvas?.clientHeight ?? null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];

  const entries = (snapshot?.state?.texts ?? [])
    .map((entry) => normalizeTextEntry(entry, width, height))
    .filter(Boolean);
  const names = entries.filter(isMapNameEntry);
  const values = entries.filter(isMapTroopEntry);
  const labels = [];

  for (const name of names) {
    const troopEntry = nearestTroopEntry(name, values);
    labels.push({
      name: name.text,
      troops: troopEntry?.value ?? null,
      x: name.x,
      y: name.y,
      nx: name.nx,
      ny: name.ny,
      at: name.at,
      font: name.font,
      fillStyle: name.fillStyle,
      fontSize: name.fontSize,
      relation: labelRelation(name.text, playerName, opponentNames),
    });
  }

  return latestUniqueLabels(labels)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, options.maxLabels ?? 24);
}

function normalizeTextEntry(entry, width, height) {
  const text = String(entry.text ?? "");
  const x = Number(entry.screen?.x ?? entry.x);
  const y = Number(entry.screen?.y ?? entry.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    text,
    at: entry.at ?? null,
    x,
    y,
    nx: x / width,
    ny: y / height,
    font: entry.font ?? null,
    fillStyle: entry.fillStyle ?? null,
    fontSize: fontSize(entry.font),
  };
}

function isMapNameEntry(entry) {
  if (!isMapArea(entry)) return false;
  if ((entry.fontSize ?? 0) < 20) return false;
  if (parseNumeric(entry.text) !== null) return false;
  if (latestSelectedAttack([entry.text])) return false;
  if (/^(LEADERBOARD|Players|Percentage|Interest|Income|Time|MAP:|Map:)$/i.test(entry.text)) return false;
  if (/^\d+\.$/.test(entry.text)) return false;
  return /[A-Za-z]/.test(entry.text);
}

function isMapTroopEntry(entry) {
  if (!isMapArea(entry)) return false;
  if ((entry.fontSize ?? 0) < 18) return false;
  return parseNumeric(entry.text) !== null;
}

function isMapArea(entry) {
  return entry.nx >= 0.24 && entry.nx <= 0.92 && entry.ny >= 0.05 && entry.ny <= 0.88;
}

function nearestTroopEntry(name, values) {
  const candidates = values
    .map((value) => ({
      ...value,
      value: parseNumeric(value.text),
      dx: Math.abs(value.x - name.x),
      dy: value.y - name.y,
      dt: Math.abs((value.at ?? 0) - (name.at ?? 0)),
    }))
    .filter((value) => value.dy >= 10 && value.dy <= 70)
    .filter((value) => value.dx <= 120)
    .filter((value) => value.dt <= 250 || value.at === null || name.at === null)
    .sort((a, b) => (a.dx + a.dy * 0.25 + a.dt * 0.005) - (b.dx + b.dy * 0.25 + b.dt * 0.005));
  return candidates[0] ?? null;
}

function latestUniqueLabels(labels) {
  const byKey = new Map();
  for (const label of labels) {
    const key = `${label.name}:${Math.round(label.nx * 100)}:${Math.round(label.ny * 100)}`;
    const existing = byKey.get(key);
    if (!existing || (label.at ?? 0) > (existing.at ?? 0)) byKey.set(key, label);
  }
  return Array.from(byKey.values());
}

function labelRelation(name, playerName, opponentNames = new Set()) {
  if (playerName && name === playerName) return "own";
  if (/neutral/i.test(name)) return "neutral";
  if (opponentNames.has(name) || /^Player \d+$/.test(name)) return "opponent";
  return "unknown";
}

function fontSize(font) {
  const match = String(font ?? "").match(/(\d+(?:\.\d+)?)px/);
  return match ? Number.parseFloat(match[1]) : null;
}

function parseNumeric(value) {
  const normalized = String(value).replace(/\s+/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}
