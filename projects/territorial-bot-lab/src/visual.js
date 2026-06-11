export async function decodeVisualState(harness, options = {}) {
  const grid = await harness.sampleCanvasGrid({
    cols: options.cols ?? 80,
    rows: options.rows ?? 50,
  });
  return decodeCanvasGrid(grid, options);
}

export function decodeCanvasGrid(grid, options = {}) {
  const center = options.center ?? { x: 0.5, y: 0.5 };
  const cells = grid.samples.map((sample) => ({
    ...sample,
    nx: sample.x / grid.width,
    ny: sample.y / grid.height,
  }));
  const ownedColor = estimateOwnedColor(cells, { ...options, center });
  const maxLocalRadius = options.maxLocalRadius ?? 0.31;
  const candidateOwnedCells = ownedColor
    ? cells
        .filter((cell) => isMapCell(cell))
        .filter((cell) => distanceFromCenter(cell, center) <= maxLocalRadius)
        .filter((cell) => colorDistance(cell.rgba, ownedColor) <= 95)
    : [];
  const ownedCells = connectedCenterComponent(candidateOwnedCells, center);
  const ownedKeys = new Set(ownedCells.map((cell) => cellKey(cell)));
  const candidateNonOwnedCells = ownedColor
    ? cells
        .filter((cell) => isMapCell(cell))
        .filter((cell) => distanceFromCenter(cell, center) <= maxLocalRadius)
        .filter((cell) => !ownedKeys.has(cellKey(cell)))
        .filter((cell) => isLikelyLand(cell.rgba))
        .filter((cell) => distanceFromCenter(cell, center) > (options.minFrontierDistance ?? 0.085))
    : [];
  const frontier = ownedColor
    ? candidateNonOwnedCells
        .filter((cell) => hasOwnedNeighbor(cell, ownedKeys))
        .map((cell) => ({
          x: cell.nx,
          y: cell.ny,
          col: cell.col,
          row: cell.row,
          rgba: cell.rgba,
          score: frontierScore(cell, center),
        }))
        .sort((a, b) => b.score - a.score)
    : [];
  const neighborRegions = ownedColor
    ? findNeighborRegions(candidateNonOwnedCells, ownedKeys, { ...options, center })
    : [];

  return {
    grid: {
      width: grid.width,
      height: grid.height,
      cols: grid.cols,
      rows: grid.rows,
    },
    center,
    ownedColor,
    ownedCellCount: ownedCells.length,
    frontier,
    neighborRegions,
    recommendedTarget: frontier[0] ? { x: frontier[0].x, y: frontier[0].y } : null,
    recommendedRegionTarget: neighborRegions[0]?.target ?? null,
  };
}

export function estimateOwnedColor(cells, options = {}) {
  const center = options.center ?? { x: 0.5, y: 0.5 };
  const seedPoints = [
    { x: center.x, y: center.y },
    { x: center.x - 0.035, y: center.y },
    { x: center.x + 0.035, y: center.y },
    { x: center.x, y: center.y - 0.065 },
    { x: center.x, y: center.y + 0.065 },
    { x: center.x - 0.055, y: center.y + 0.045 },
    { x: center.x + 0.055, y: center.y + 0.045 },
  ];
  const seedCells = seedPoints
    .map((point) => nearestCell(cells, point.x, point.y))
    .filter(Boolean)
    .filter((cell) => chroma(cell.rgba) >= 18)
    .filter((cell) => !isBrightText(cell.rgba));
  if (!seedCells.length) return null;

  const buckets = new Map();
  for (const cell of seedCells) {
    const key = quantizedKey(cell.rgba, 24);
    const bucket = buckets.get(key) ?? { cells: [], key };
    bucket.cells.push(cell);
    buckets.set(key, bucket);
  }
  const best = Array.from(buckets.values()).sort((a, b) => b.cells.length - a.cells.length)[0];
  return averageColor(best.cells.map((cell) => cell.rgba));
}

export function chooseVisualExpansionTarget(decoded, fallbackTargets = [], options = {}) {
  const recentTargets = options.recentTargets ?? [];
  const minDistance = options.minRecentDistance ?? 0.06;
  const avoidTargets = options.avoidTargets ?? [];
  const minAvoidDistance = options.minAvoidDistance ?? minDistance;
  const frontierTarget = decoded?.frontier?.find((target) =>
    isAllowedTarget(target, { recentTargets, minDistance, avoidTargets, minAvoidDistance }),
  );
  if (frontierTarget) return { x: frontierTarget.x, y: frontierTarget.y };
  if (
    decoded?.recommendedTarget &&
    isAllowedTarget(decoded.recommendedTarget, { recentTargets, minDistance, avoidTargets, minAvoidDistance })
  ) {
    return decoded.recommendedTarget;
  }
  return fallbackTargets.find((target) =>
    isAllowedTarget(target, { recentTargets, minDistance, avoidTargets, minAvoidDistance }),
  ) ?? null;
}

export function chooseNeighborRegionTarget(decoded, fallbackTargets = [], options = {}) {
  const recentTargets = options.recentTargets ?? [];
  const minDistance = options.minRecentDistance ?? 0.06;
  const avoidTargets = options.avoidTargets ?? [];
  const minAvoidDistance = options.minAvoidDistance ?? minDistance;
  const region = decoded?.neighborRegions?.find((candidate) =>
    isAllowedTarget(candidate.target, { recentTargets, minDistance, avoidTargets, minAvoidDistance }),
  );
  if (region) return region.target;
  if (
    decoded?.recommendedRegionTarget &&
    isAllowedTarget(decoded.recommendedRegionTarget, { recentTargets, minDistance, avoidTargets, minAvoidDistance })
  ) {
    return decoded.recommendedRegionTarget;
  }
  return chooseVisualExpansionTarget(decoded, fallbackTargets, options);
}

function nearestCell(cells, nx, ny) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    const dx = cell.nx - nx;
    const dy = cell.ny - ny;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}

function pointDistance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isFreshTarget(target, recentTargets, minDistance) {
  return recentTargets.every((recent) => pointDistance(target, recent) >= minDistance);
}

function isAllowedTarget(target, options) {
  if (!isFreshTarget(target, options.recentTargets, options.minDistance)) return false;
  return options.avoidTargets.every((avoid) => {
    const avoidTarget = avoid.target ?? avoid;
    if (!Number.isFinite(avoidTarget?.x) || !Number.isFinite(avoidTarget?.y)) return true;
    const minDistance = Number.isFinite(avoid.distance) ? avoid.distance : options.minAvoidDistance;
    return pointDistance(target, avoidTarget) >= minDistance;
  });
}

function isMapCell(cell) {
  if (cell.nx < 0.24 || cell.nx > 0.92) return false;
  if (cell.ny < 0.05 || cell.ny > 0.88) return false;
  return true;
}

function isLikelyLand(rgba) {
  const [red, green, blue, alpha] = rgba;
  if (alpha < 200) return false;
  if (isBrightText(rgba)) return false;
  if (chroma(rgba) < 25) return false;
  if (red < 25 && green < 25 && blue < 25) return false;
  if (blue > green + 25 && blue > red + 25) return false;
  return green > 55 || red > 70;
}

function hasOwnedNeighbor(cell, ownedKeys) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (ownedKeys.has(`${cell.col + dx}:${cell.row + dy}`)) return true;
    }
  }
  return false;
}

function findNeighborRegions(cells, ownedKeys, options = {}) {
  const minRegionCells = options.minRegionCells ?? 2;
  const center = options.center ?? { x: 0.5, y: 0.5 };
  const byKey = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const visited = new Set();
  const regions = [];

  for (const start of cells) {
    const startKey = cellKey(start);
    if (visited.has(startKey)) continue;

    const queue = [start];
    const regionCells = [];
    visited.add(startKey);

    for (let index = 0; index < queue.length; index += 1) {
      const cell = queue[index];
      regionCells.push(cell);
      for (const neighbor of sameRegionNeighbors(cell, byKey, start.rgba, options)) {
        const key = cellKey(neighbor);
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push(neighbor);
      }
    }

    const borderCells = regionCells.filter((cell) => hasOwnedNeighbor(cell, ownedKeys));
    if (borderCells.length < minRegionCells) continue;
    const targetCell = chooseRegionTargetCell(regionCells, borderCells, center);
    regions.push({
      target: { x: targetCell.nx, y: targetCell.ny },
      cellCount: regionCells.length,
      borderCellCount: borderCells.length,
      averageColor: averageColor(regionCells.map((cell) => cell.rgba)),
      score: regionScore(regionCells, borderCells, targetCell, center),
    });
  }

  return regions.sort((a, b) => b.score - a.score);
}

function sameRegionNeighbors(cell, byKey, seedColor, options) {
  const maxDistance = options.regionColorDistance ?? 70;
  const neighbors = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = byKey.get(`${cell.col + dx}:${cell.row + dy}`);
      if (!neighbor) continue;
      if (colorDistance(neighbor.rgba, seedColor) > maxDistance) continue;
      neighbors.push(neighbor);
    }
  }
  return neighbors;
}

function chooseRegionTargetCell(regionCells, borderCells, center) {
  const candidates = borderCells.length ? borderCells : regionCells;
  return candidates.toSorted((a, b) => frontierScore(b, center) - frontierScore(a, center))[0];
}

function regionScore(regionCells, borderCells, targetCell, center) {
  const contactScore = borderCells.length * 0.2;
  const sizeScore = Math.sqrt(regionCells.length) * 0.08;
  return frontierScore(targetCell, center) + contactScore + sizeScore;
}

function connectedCenterComponent(cells, center) {
  if (!cells.length) return [];
  const byKey = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const start = cells.toSorted((a, b) => distanceFromCenter(a, center) - distanceFromCenter(b, center))[0];
  const queue = [start];
  const visited = new Set([cellKey(start)]);

  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const key = `${cell.col + dx}:${cell.row + dy}`;
        if (visited.has(key) || !byKey.has(key)) continue;
        visited.add(key);
        queue.push(byKey.get(key));
      }
    }
  }

  return queue;
}

function frontierScore(cell, center = { x: 0.5, y: 0.5 }) {
  const distance = distanceFromCenter(cell, center);
  const angleBias = cell.ny < center.y ? 0.02 : 0;
  return distance + angleBias;
}

function distanceFromCenter(cell, center = { x: 0.5, y: 0.5 }) {
  const dx = cell.nx - center.x;
  const dy = cell.ny - center.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function cellKey(cell) {
  return `${cell.col}:${cell.row}`;
}

function colorDistance(left, right) {
  const dr = left[0] - right[0];
  const dg = left[1] - right[1];
  const db = left[2] - right[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function chroma(rgba) {
  return Math.max(rgba[0], rgba[1], rgba[2]) - Math.min(rgba[0], rgba[1], rgba[2]);
}

function isBrightText(rgba) {
  return rgba[0] > 230 && rgba[1] > 230 && rgba[2] > 230;
}

function quantizedKey(rgba, step) {
  return rgba.slice(0, 3).map((value) => Math.round(value / step) * step).join(":");
}

function averageColor(colors) {
  const total = colors.reduce(
    (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2], acc[3] + color[3]],
    [0, 0, 0, 0],
  );
  return total.map((value) => Math.round(value / colors.length));
}
