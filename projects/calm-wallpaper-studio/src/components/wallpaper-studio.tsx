"use client";

import {
  Cloud,
  Copy,
  Download,
  Expand,
  Heart,
  Menu,
  Moon,
  Move,
  RefreshCw,
  Settings,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Wand2
} from "lucide-react";
import { type CSSProperties, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type MoodKey = "dim" | "soft" | "electric" | "warm" | "dream";
type PaletteKey = "reference" | "plasma" | "cobalt" | "ember" | "rose";
type ShapeKey = "capsule" | "aura" | "wave" | "strip";
type ToolKey = "select" | "orb" | "capsule" | "band" | "shadow";
type LayerKind = "orb" | "capsule" | "band" | "shadow";
type RandomMode = "balanced" | "bold";

type Resolution = {
  key: string;
  label: string;
  sizeLabel: string;
  width: number;
  height: number;
};

type WallpaperSettings = {
  seed: number;
  mood: MoodKey;
  palette: PaletteKey;
  shape: ShapeKey;
  colorfulness: number;
  softness: number;
  grain: number;
  resolutionKey: string;
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type Mood = {
  label: string;
  icon: typeof Sun;
  intensity: number;
  darkness: number;
  bloom: number;
  warmth: number;
};

type Scene = {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  rotation: number;
  power: number;
  warpA: number;
  warpB: number;
  phaseA: number;
  phaseB: number;
  shape: ShapeKey;
};

type GlowLayer = {
  id: string;
  kind: LayerKind;
  x: number;
  y: number;
  radius: number;
  stretch: number;
  rotation: number;
  intensity: number;
  colorIndex: number;
};

type GeneratedComposition = Pick<WallpaperSettings, "seed" | "mood" | "palette" | "shape" | "colorfulness" | "softness" | "grain"> & {
  recipe: number;
  layers: GlowLayer[];
};

const RESOLUTIONS: Resolution[] = [
  { key: "phone", label: "Phone", sizeLabel: "1170 x 2532", width: 1170, height: 2532 },
  { key: "16-9", label: "16:9", sizeLabel: "1920 x 1080", width: 1920, height: 1080 },
  { key: "16-10", label: "16:10", sizeLabel: "1920 x 1200", width: 1920, height: 1200 },
  { key: "4-3", label: "4:3", sizeLabel: "1600 x 1200", width: 1600, height: 1200 },
  { key: "1-1", label: "1:1", sizeLabel: "1080 x 1080", width: 1080, height: 1080 },
  { key: "4k", label: "4K", sizeLabel: "3840 x 2160", width: 3840, height: 2160 }
];

const MOODS: Record<MoodKey, Mood> = {
  dim: { label: "Dim", icon: Moon, intensity: 0.68, darkness: 0.95, bloom: 0.82, warmth: 0.02 },
  soft: { label: "Soft", icon: Cloud, intensity: 0.84, darkness: 0.86, bloom: 1.08, warmth: 0.05 },
  electric: { label: "Electric", icon: Sparkles, intensity: 1.05, darkness: 0.88, bloom: 0.92, warmth: -0.02 },
  warm: { label: "Warm", icon: Sun, intensity: 0.95, darkness: 0.86, bloom: 0.94, warmth: 0.18 },
  dream: { label: "Dream", icon: Wand2, intensity: 0.9, darkness: 0.82, bloom: 1.14, warmth: 0.08 }
};

const PALETTES: Record<PaletteKey, { label: string; colors: string[] }> = {
  reference: { label: "Reference", colors: ["#020303", "#ff421d", "#ffad2e", "#1451ff", "#e8efff", "#df38e7"] },
  plasma: { label: "Plasma", colors: ["#020205", "#ff2867", "#ff9c23", "#243fff", "#92edff", "#d722ff"] },
  cobalt: { label: "Cobalt", colors: ["#020407", "#0d36ff", "#ff7a27", "#27b6ff", "#edf2ff", "#7c24ff"] },
  ember: { label: "Ember", colors: ["#040202", "#ff3214", "#ffc43b", "#334bd6", "#f3ead9", "#b91979"] },
  rose: { label: "Rose", colors: ["#040206", "#ff2b99", "#ff7a35", "#3542ff", "#ead7ff", "#bb1fff"] }
};

const SHAPES: Record<ShapeKey, string> = {
  capsule: "Lock glow",
  aura: "Soft aura",
  wave: "Side bloom",
  strip: "Dawn glow"
};

const LAYER_LABELS: Record<LayerKind, string> = {
  orb: "Glow",
  capsule: "Capsule",
  band: "Band",
  shadow: "Shade"
};

const DEFAULT_SETTINGS: WallpaperSettings = {
  seed: 184729,
  mood: "soft",
  palette: "reference",
  shape: "capsule",
  colorfulness: 62,
  softness: 92,
  grain: 16,
  resolutionKey: "phone"
};

const DEFAULT_LAYERS: GlowLayer[] = [
  {
    id: "layer-center-bloom",
    kind: "orb",
    x: 0.5,
    y: 0.52,
    radius: 0.2,
    stretch: 1.15,
    rotation: 0,
    intensity: 0.62,
    colorIndex: 4
  },
  {
    id: "layer-warm-floor",
    kind: "band",
    x: 0.52,
    y: 0.76,
    radius: 0.24,
    stretch: 1.55,
    rotation: -0.04,
    intensity: 0.52,
    colorIndex: 2
  }
];

const TOOLS: Array<{ key: ToolKey; label: string; icon: typeof Sun }> = [
  { key: "select", label: "Move", icon: Move },
  { key: "orb", label: "Glow", icon: Sparkles },
  { key: "capsule", label: "Capsule", icon: Cloud },
  { key: "band", label: "Band", icon: Sun },
  { key: "shadow", label: "Shade", icon: Moon }
];

const MOOD_KEYS = Object.keys(MOODS) as MoodKey[];
const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];
const SHAPE_KEYS = Object.keys(SHAPES) as ShapeKey[];
const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hashSeed(seed: number, salt: number) {
  const mixed = Math.imul(seed ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  return (mixed ^ (mixed >>> 13)) >>> 0;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function hashNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + seed, 2246822519);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount
  };
}

function addColor(target: Rgb, color: Rgb, weight: number) {
  target.r += color.r * weight;
  target.g += color.g * weight;
  target.b += color.b * weight;
}

function normalizeColor(color: Rgb, weight: number) {
  if (weight <= 0.0001) return { r: 0, g: 0, b: 0 };
  return {
    r: color.r / weight,
    g: color.g / weight,
    b: color.b / weight
  };
}

function toneColor(color: Rgb, warmth: number) {
  return {
    r: clamp(color.r + warmth * 34, 0, 255),
    g: clamp(color.g + warmth * 13, 0, 255),
    b: clamp(color.b - warmth * 24, 0, 255)
  };
}

function gaussian(value: number, center: number, width: number) {
  const d = (value - center) / width;
  return Math.exp(-d * d);
}

function ellipse(valueX: number, valueY: number, centerX: number, centerY: number, width: number, height: number) {
  const dx = (valueX - centerX) / width;
  const dy = (valueY - centerY) / height;
  return Math.exp(-(dx * dx + dy * dy));
}

function selectedResolution(settings: WallpaperSettings) {
  return RESOLUTIONS.find((resolution) => resolution.key === settings.resolutionKey) ?? RESOLUTIONS[0];
}

function buildScene(settings: WallpaperSettings, ratio: number): Scene {
  const rand = mulberry32(hashSeed(settings.seed, 211));
  const portrait = ratio < 0.75;

  if (settings.shape === "aura") {
    return {
      cx: 0.5 + (rand() - 0.5) * 0.08,
      cy: portrait ? 0.53 + (rand() - 0.5) * 0.1 : 0.5 + (rand() - 0.5) * 0.08,
      halfW: portrait ? 0.43 : 0.33,
      halfH: portrait ? 0.32 : 0.42,
      rotation: (rand() - 0.5) * 0.12,
      power: 2.5,
      warpA: 0.035 + rand() * 0.035,
      warpB: 0.015 + rand() * 0.025,
      phaseA: rand() * TAU,
      phaseB: rand() * TAU,
      shape: settings.shape
    };
  }

  if (settings.shape === "wave") {
    return {
      cx: portrait ? 0.54 + (rand() - 0.5) * 0.1 : 0.56 + (rand() - 0.5) * 0.08,
      cy: portrait ? 0.58 + (rand() - 0.5) * 0.1 : 0.54 + (rand() - 0.5) * 0.08,
      halfW: portrait ? 0.54 : 0.44,
      halfH: portrait ? 0.28 : 0.34,
      rotation: -0.06 + (rand() - 0.5) * 0.14,
      power: 2.7,
      warpA: 0.045 + rand() * 0.04,
      warpB: 0.025 + rand() * 0.025,
      phaseA: rand() * TAU,
      phaseB: rand() * TAU,
      shape: settings.shape
    };
  }

  if (settings.shape === "strip") {
    return {
      cx: 0.5 + (rand() - 0.5) * 0.04,
      cy: portrait ? 0.66 + (rand() - 0.5) * 0.08 : 0.62 + (rand() - 0.5) * 0.08,
      halfW: portrait ? 0.58 : 0.52,
      halfH: portrait ? 0.55 : 0.44,
      rotation: (rand() - 0.5) * 0.04,
      power: 2.2,
      warpA: 0.025 + rand() * 0.035,
      warpB: 0.014 + rand() * 0.018,
      phaseA: rand() * TAU,
      phaseB: rand() * TAU,
      shape: settings.shape
    };
  }

  return {
    cx: 0.5 + (rand() - 0.5) * 0.05,
    cy: portrait ? 0.57 + (rand() - 0.5) * 0.06 : 0.52 + (rand() - 0.5) * 0.05,
    halfW: portrait ? 0.36 + rand() * 0.025 : 0.26 + rand() * 0.03,
    halfH: portrait ? 0.34 + rand() * 0.035 : 0.39 + rand() * 0.04,
    rotation: (rand() - 0.5) * 0.05,
    power: 4.4,
    warpA: 0.025 + rand() * 0.02,
    warpB: 0.012 + rand() * 0.014,
    phaseA: rand() * TAU,
    phaseB: rand() * TAU,
    shape: settings.shape
  };
}

function renderWallpaper(canvas: HTMLCanvasElement, settings: WallpaperSettings, output: Resolution, layers: GlowLayer[] = []) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  const width = output.width;
  const height = output.height;
  const ratio = width / height;
  const mood = MOODS[settings.mood];
  const colors = PALETTES[settings.palette].colors.map((hex) => toneColor(hexToRgb(hex), mood.warmth));
  const scene = buildScene(settings, ratio);
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const intensity = clamp(0.36 + (settings.colorfulness / 100) * 0.9 + mood.intensity * 0.12, 0.35, 1.22);
  const softness = settings.softness / 100;
  const grain = settings.grain / 100;
  const noiseSeed = hashSeed(settings.seed, 719);

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const pixel = shadePixel(u, v, scene, colors, mood, intensity, softness, layers);
      const fineNoise = (hashNoise(x, y, noiseSeed) - 0.5) * (5 + grain * 20);
      const offset = (y * width + x) * 4;
      data[offset] = clamp(Math.round(pixel.r + fineNoise), 0, 255);
      data[offset + 1] = clamp(Math.round(pixel.g + fineNoise), 0, 255);
      data[offset + 2] = clamp(Math.round(pixel.b + fineNoise), 0, 255);
      data[offset + 3] = 255;
    }
  }

  canvas.width = width;
  canvas.height = height;
  ctx.putImageData(image, 0, 0);
  drawOpticalBloom(ctx, width, height, softness, mood.bloom);
  drawFilmGrain(ctx, width, height, grain, hashSeed(settings.seed, 89));
}

function shadePixel(
  u: number,
  v: number,
  scene: Scene,
  colors: Rgb[],
  mood: Mood,
  intensity: number,
  softness: number,
  layers: GlowLayer[]
): Rgb {
  const base = mix(colors[0], { r: 7, g: 10, b: 11 }, 0.42);
  const edgeShade = edgeFalloff(u, v, mood.darkness);
  const warp =
    Math.sin((u * 1.35 + v * 0.22) * TAU + scene.phaseA) * scene.warpA +
    Math.sin((v * 1.1 - u * 0.32) * TAU + scene.phaseB) * scene.warpB;

  const rotated = rotatePoint(u - scene.cx, v + warp - scene.cy, scene.rotation);
  const sx = rotated.x / scene.halfW;
  const sy = rotated.y / scene.halfH;
  const superShape = Math.pow(Math.pow(Math.abs(sx), scene.power) + Math.pow(Math.abs(sy), scene.power), 1 / scene.power);
  const localT = clamp((sy + 1) * 0.5 + warp * 0.55, 0, 1);
  const localX = clamp((sx + 1) * 0.5, 0, 1);
  const core = Math.exp(-Math.pow(superShape * (0.95 - softness * 0.12), 2.15));
  const bloom = Math.exp(-Math.pow(superShape * (0.62 - softness * 0.08), 2.05)) * 0.38;
  const rim = Math.exp(-Math.pow((superShape - 0.9) / (0.22 + softness * 0.12), 2));
  const inside = smoothstep(1.45, 0.18, superShape);

  const color = { r: 0, g: 0, b: 0 };
  let weight = 0;

  const coolWeight = gaussian(localT, scene.shape === "strip" ? 0.28 : 0.33, 0.24) * (0.72 + inside * 0.42);
  const lightWeight = gaussian(localT, 0.51, 0.22) * (0.82 + inside * 0.45);
  const warmWeight = gaussian(localT, scene.shape === "strip" ? 0.82 : 0.73, 0.26) * (0.9 + inside * 0.42);
  const rimWarmWeight = rim * gaussian(localT, 0.72, 0.36) * (0.56 + Math.abs(localX - 0.5));
  const accentWeight = rim * gaussian(localT, 0.48, 0.44) * (0.22 + Math.abs(localX - 0.5) * 0.58);

  addColor(color, colors[3], coolWeight);
  addColor(color, colors[4], lightWeight);
  addColor(color, colors[2], warmWeight);
  addColor(color, colors[1], rimWarmWeight);
  addColor(color, colors[5], accentWeight);
  weight += coolWeight + lightWeight + warmWeight + rimWarmWeight + accentWeight;

  const fieldColor = normalizeColor(color, weight);
  let light = (core * 0.92 + bloom + rim * 0.2) * intensity;

  const secondary = secondaryLight(u, v, scene, colors, intensity);
  const custom = customLayerLight(u, v, layers, colors, softness);
  light += secondary.amount;
  light += custom.amount;

  if (scene.shape === "wave") {
    const cut = ellipse(u, v, 0.08, scene.cy + 0.01, 0.28, 0.08) * 0.78;
    light *= 1 - cut;
  }

  const seededGlow = mix(fieldColor, secondary.color, secondary.blend);
  const glow = mix(seededGlow, custom.color, custom.blend);
  const screen = 1 - Math.exp(-light * edgeShade);
  const room = lowLightRoom(u, v, base, mood.darkness);
  const shade = 1 - custom.shadow * 0.84;

  return {
    r: clamp((room.r + glow.r * screen) * shade, 0, 255),
    g: clamp((room.g + glow.g * screen) * shade, 0, 255),
    b: clamp((room.b + glow.b * screen) * shade, 0, 255)
  };
}

function customLayerLight(u: number, v: number, layers: GlowLayer[], colors: Rgb[], softness: number) {
  const color = { r: 0, g: 0, b: 0 };
  let colorWeight = 0;
  let amount = 0;
  let shadow = 0;

  for (const layer of layers) {
    const local = rotatePoint(u - layer.x, v - layer.y, layer.rotation);
    const radius = Math.max(0.025, layer.radius);
    const stretch = Math.max(0.32, layer.stretch);
    const layerColor = colors[clamp(layer.colorIndex, 1, colors.length - 1)];
    let field = 0;

    if (layer.kind === "capsule") {
      const sx = local.x / (radius * 0.82);
      const sy = local.y / (radius * stretch);
      const superShape = Math.pow(Math.pow(Math.abs(sx), 4.5) + Math.pow(Math.abs(sy), 4.5), 1 / 4.5);
      field = Math.exp(-Math.pow(superShape * (1.18 - softness * 0.16), 2.1));
    } else if (layer.kind === "band") {
      field = Math.exp(
        -(
          Math.pow(local.x / (radius * stretch * 2.2), 2) +
          Math.pow(local.y / (radius * (0.28 + softness * 0.18)), 2)
        ) * 1.22
      );
    } else if (layer.kind === "shadow") {
      field = Math.exp(
        -(
          Math.pow(local.x / (radius * stretch * 1.7), 2) +
          Math.pow(local.y / (radius * 0.72), 2)
        ) * 1.1
      );
      shadow += field * layer.intensity;
      continue;
    } else {
      field = Math.exp(
        -(
          Math.pow(local.x / radius, 2) +
          Math.pow(local.y / (radius * stretch), 2)
        ) * (1.3 - softness * 0.34)
      );
    }

    const glow = field * layer.intensity;
    amount += glow * 0.58;
    addColor(color, layerColor, glow);
    colorWeight += glow;
  }

  return {
    amount,
    color: normalizeColor(color, colorWeight),
    blend: clamp(colorWeight / 1.4, 0, 0.86),
    shadow: clamp(shadow, 0, 0.9)
  };
}

function secondaryLight(u: number, v: number, scene: Scene, colors: Rgb[], intensity: number) {
  let amount = 0;
  const color = { r: 0, g: 0, b: 0 };
  let weight = 0;

  const cool = ellipse(u, v, scene.cx + scene.halfW * 0.28, scene.cy - scene.halfH * 0.2, scene.halfW * 0.62, scene.halfH * 0.38);
  const warm = ellipse(u, v, scene.cx - scene.halfW * 0.08, scene.cy + scene.halfH * 0.46, scene.halfW * 0.72, scene.halfH * 0.4);
  const magenta = ellipse(u, v, scene.cx - scene.halfW * 0.36, scene.cy + scene.halfH * 0.08, scene.halfW * 0.46, scene.halfH * 0.5);

  addColor(color, colors[3], cool * 0.9);
  addColor(color, colors[2], warm * 1.08);
  addColor(color, colors[5], magenta * 0.48);
  weight += cool * 0.9 + warm * 1.08 + magenta * 0.48;
  amount += (cool * 0.18 + warm * 0.24 + magenta * 0.1) * intensity;

  if (scene.shape === "strip") {
    const horizon = gaussian(v, scene.cy + scene.halfH * 0.26, 0.075) * smoothstep(0.06, 0.5, u) * smoothstep(0.94, 0.5, u);
    addColor(color, colors[2], horizon * 1.2);
    weight += horizon * 1.2;
    amount += horizon * 0.24 * intensity;
  }

  return {
    amount,
    color: normalizeColor(color, weight),
    blend: clamp(weight / 2.5, 0, 0.72)
  };
}

function lowLightRoom(u: number, v: number, base: Rgb, darkness: number): Rgb {
  const lowGlow = ellipse(u, v, 0.35, 0.88, 0.62, 0.32) * (1 - darkness * 0.35);
  const topLift = ellipse(u, v, 0.5, 0.08, 0.9, 0.32) * 0.18;
  const value = 2.2 + lowGlow * 18 + topLift * 8;
  return {
    r: base.r + value,
    g: base.g + value * 1.04,
    b: base.b + value * 1.08
  };
}

function edgeFalloff(u: number, v: number, darkness: number) {
  const side = smoothstep(0, 0.12, u) * smoothstep(1, 0.88, u);
  const vertical = smoothstep(0, 0.09, v) * smoothstep(1, 0.9, v);
  const center = ellipse(u, v, 0.5, 0.55, 0.74, 0.62);
  return clamp((0.12 + center * 0.98) * side * vertical * (1.1 - darkness * 0.08), 0, 1);
}

function rotatePoint(x: number, y: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
}

function drawOpticalBloom(ctx: CanvasRenderingContext2D, width: number, height: number, softness: number, bloom: number) {
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d", { alpha: false });
  if (!sourceCtx) return;

  sourceCtx.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.16 + softness * bloom * 0.24;
  ctx.filter = `blur(${Math.round(Math.min(width, height) * (0.018 + softness * 0.026))}px) saturate(${1.04 + softness * 0.1})`;
  ctx.drawImage(source, 0, 0);
  ctx.restore();
}

function drawFilmGrain(ctx: CanvasRenderingContext2D, width: number, height: number, grain: number, seed: number) {
  if (grain <= 0.01) return;

  const noiseWidth = Math.max(380, Math.round(width / 1.4));
  const noiseHeight = Math.max(240, Math.round(height / 1.4));
  const noiseCanvas = document.createElement("canvas");
  noiseCanvas.width = noiseWidth;
  noiseCanvas.height = noiseHeight;
  const noiseCtx = noiseCanvas.getContext("2d", { willReadFrequently: true });
  if (!noiseCtx) return;

  const image = noiseCtx.createImageData(noiseWidth, noiseHeight);
  const rand = mulberry32(seed);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 104 + Math.floor(rand() * 96);
    const alpha = Math.floor((1.5 + rand() * 8) * grain);
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = alpha;
  }
  noiseCtx.putImageData(image, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noiseCanvas, 0, 0, width, height);
  ctx.restore();
}

function randomSeed() {
  return Math.floor(100000 + Math.random() * 899999);
}

function randomChoice<T>(items: T[], rand: () => number) {
  return items[Math.floor(rand() * items.length)];
}

function randomRange(rand: () => number, min: number, max: number) {
  return min + rand() * (max - min);
}

function randomChance(rand: () => number, chance: number) {
  return rand() < chance;
}

function previewSizeFor(resolution: Resolution): Resolution {
  const maxWidth = 1600;
  const maxHeight = 1100;
  const scale = Math.min(1, maxWidth / resolution.width, maxHeight / resolution.height);
  return {
    ...resolution,
    width: Math.round(resolution.width * scale),
    height: Math.round(resolution.height * scale)
  };
}

function paletteBackground(colors: string[]) {
  return [
    `radial-gradient(circle at 50% 48%, ${colors[4]} 0%, ${colors[3]} 24%, transparent 54%)`,
    `radial-gradient(circle at 33% 64%, ${colors[5]} 0%, transparent 46%)`,
    `radial-gradient(circle at 67% 72%, ${colors[2]} 0%, ${colors[1]} 36%, transparent 58%)`,
    `linear-gradient(145deg, ${colors[0]} 0%, ${colors[3]} 48%, ${colors[1]} 100%)`
  ].join(", ");
}

function layerHandleStyle(layer: GlowLayer): CSSProperties {
  const base = layer.radius * 100;
  const width =
    layer.kind === "band"
      ? clamp(base * layer.stretch * 2.15, 18, 88)
      : layer.kind === "capsule"
        ? clamp(base * Math.max(1, layer.stretch) * 1.18, 11, 68)
        : clamp(base * Math.max(0.85, layer.stretch) * 1.35, 10, 62);
  const height =
    layer.kind === "band"
      ? clamp(base * 0.34, 4, 15)
      : layer.kind === "capsule"
        ? clamp(base * 1.52, 11, 72)
        : clamp(base * 1.28, 10, 58);

  return {
    left: `${layer.x * 100}%`,
    top: `${layer.y * 100}%`,
    width: `${width}%`,
    height: `${height}%`,
    transform: `translate(-50%, -50%) rotate(${layer.rotation}rad)`
  };
}

function makeLayer(kind: LayerKind, x: number, y: number, palette: PaletteKey): GlowLayer {
  const colorIndexByPalette: Record<PaletteKey, number> = {
    reference: 2,
    plasma: 5,
    cobalt: 3,
    ember: 2,
    rose: 5
  };

  return {
    id: `layer-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    kind,
    x,
    y,
    radius: kind === "band" ? 0.2 : kind === "shadow" ? 0.18 : 0.16,
    stretch: kind === "band" ? 1.65 : kind === "capsule" ? 1.35 : 1,
    rotation: kind === "band" ? -0.04 : 0,
    intensity: kind === "shadow" ? 0.42 : 0.58,
    colorIndex: colorIndexByPalette[palette]
  };
}

function generatedLayer(
  seed: number,
  recipe: string,
  index: number,
  kind: LayerKind,
  x: number,
  y: number,
  radius: number,
  stretch: number,
  rotation: number,
  intensity: number,
  colorIndex: number
): GlowLayer {
  return {
    id: `layer-${seed}-${recipe}-${index}`,
    kind,
    x: clamp(x, 0.03, 0.97),
    y: clamp(y, 0.03, 0.97),
    radius: clamp(radius, 0.04, 0.34),
    stretch: clamp(stretch, 0.35, 2.2),
    rotation,
    intensity: clamp(intensity, 0, 1),
    colorIndex: clamp(Math.round(colorIndex), 1, 5)
  };
}

function generateComposition(seed: number, mode: RandomMode, avoidRecipe = -1): GeneratedComposition {
  const rand = mulberry32(hashSeed(seed, mode === "bold" ? 1789 : 931));
  let recipe = Math.floor(rand() * 7);
  if (recipe === avoidRecipe) {
    recipe = (recipe + 1 + Math.floor(rand() * 6)) % 7;
  }
  const bold = mode === "bold";
  const palette = randomChoice(PALETTE_KEYS, rand);
  const mood = randomChoice(bold ? MOOD_KEYS : (["dim", "soft", "warm", "dream"] as MoodKey[]), rand);
  const colorfulness = Math.round(randomRange(rand, bold ? 58 : 42, bold ? 90 : 74));
  const softness = Math.round(randomRange(rand, bold ? 76 : 84, bold ? 95 : 99));
  const grain = Math.round(randomRange(rand, 7, bold ? 28 : 21));
  const base: Omit<GeneratedComposition, "shape" | "layers"> = {
    seed,
    recipe,
    mood,
    palette,
    colorfulness,
    softness,
    grain
  };
  const layer = (
    index: number,
    kind: LayerKind,
    x: number,
    y: number,
    radius: number,
    stretch: number,
    rotation: number,
    intensity: number,
    colorIndex: number
  ) => generatedLayer(seed, `r${recipe}`, index, kind, x, y, radius, stretch, rotation, intensity, colorIndex);

  if (recipe === 0) {
    const coreX = randomRange(rand, 0.44, 0.56);
    const coreY = randomRange(rand, 0.47, 0.6);
    return {
      ...base,
      shape: "capsule",
      layers: [
        layer(0, randomChance(rand, 0.58) ? "capsule" : "orb", coreX, coreY, randomRange(rand, 0.15, 0.23), randomRange(rand, 1.0, 1.42), randomRange(rand, -0.05, 0.05), randomRange(rand, 0.45, 0.72), randomChoice([3, 4], rand)),
        layer(1, "band", randomRange(rand, 0.45, 0.56), randomRange(rand, 0.7, 0.82), randomRange(rand, 0.17, 0.27), randomRange(rand, 1.45, 2.08), randomRange(rand, -0.08, 0.08), randomRange(rand, 0.34, 0.6), randomChoice([1, 2], rand)),
        layer(2, "shadow", randomChance(rand, 0.5) ? 0.1 : 0.9, randomRange(rand, 0.48, 0.62), randomRange(rand, 0.18, 0.29), randomRange(rand, 1.18, 1.75), randomRange(rand, -0.22, 0.22), randomRange(rand, 0.2, 0.45), 1)
      ]
    };
  }

  if (recipe === 1) {
    return {
      ...base,
      mood: randomChoice(["soft", "warm", "dream"] as MoodKey[], rand),
      shape: "strip",
      layers: [
        layer(0, "band", randomRange(rand, 0.45, 0.58), randomRange(rand, 0.73, 0.86), randomRange(rand, 0.19, 0.3), randomRange(rand, 1.65, 2.2), randomRange(rand, -0.05, 0.08), randomRange(rand, 0.44, 0.72), randomChoice([1, 2], rand)),
        layer(1, "orb", randomRange(rand, 0.42, 0.62), randomRange(rand, 0.5, 0.64), randomRange(rand, 0.16, 0.27), randomRange(rand, 1.05, 1.65), randomRange(rand, -0.16, 0.16), randomRange(rand, 0.34, 0.58), randomChoice([3, 4], rand)),
        layer(2, "shadow", randomRange(rand, 0.15, 0.86), randomRange(rand, 0.14, 0.28), randomRange(rand, 0.22, 0.34), randomRange(rand, 1.4, 2.0), randomRange(rand, -0.12, 0.12), randomRange(rand, 0.18, 0.38), 1)
      ]
    };
  }

  if (recipe === 2) {
    const fromLeft = randomChance(rand, 0.5);
    return {
      ...base,
      mood: randomChoice(["soft", "dream", "electric"] as MoodKey[], rand),
      shape: "wave",
      layers: [
        layer(0, "capsule", fromLeft ? randomRange(rand, 0.16, 0.34) : randomRange(rand, 0.66, 0.84), randomRange(rand, 0.42, 0.58), randomRange(rand, 0.16, 0.26), randomRange(rand, 1.2, 1.9), randomRange(rand, -0.42, 0.42), randomRange(rand, 0.36, 0.66), randomChoice([4, 5], rand)),
        layer(1, "orb", fromLeft ? randomRange(rand, 0.5, 0.68) : randomRange(rand, 0.32, 0.5), randomRange(rand, 0.54, 0.72), randomRange(rand, 0.14, 0.23), randomRange(rand, 0.86, 1.42), randomRange(rand, -0.12, 0.12), randomRange(rand, 0.32, 0.58), randomChoice([1, 2], rand)),
        layer(2, "shadow", fromLeft ? randomRange(rand, 0.04, 0.16) : randomRange(rand, 0.84, 0.96), randomRange(rand, 0.48, 0.64), randomRange(rand, 0.18, 0.31), randomRange(rand, 1.1, 1.8), randomRange(rand, -0.16, 0.16), randomRange(rand, 0.34, 0.6), 1)
      ]
    };
  }

  if (recipe === 3) {
    const tilt = randomRange(rand, -0.22, 0.22);
    return {
      ...base,
      shape: randomChoice(["aura", "capsule"] as ShapeKey[], rand),
      layers: [
        layer(0, "capsule", randomRange(rand, 0.34, 0.45), randomRange(rand, 0.39, 0.55), randomRange(rand, 0.12, 0.2), randomRange(rand, 1.28, 1.8), tilt, randomRange(rand, 0.34, 0.6), randomChoice([3, 4], rand)),
        layer(1, "capsule", randomRange(rand, 0.55, 0.68), randomRange(rand, 0.5, 0.68), randomRange(rand, 0.14, 0.23), randomRange(rand, 1.2, 1.72), tilt + randomRange(rand, -0.14, 0.16), randomRange(rand, 0.32, 0.58), randomChoice([4, 5], rand)),
        layer(2, "band", randomRange(rand, 0.46, 0.58), randomRange(rand, 0.72, 0.84), randomRange(rand, 0.14, 0.22), randomRange(rand, 1.4, 2.08), randomRange(rand, -0.12, 0.12), randomRange(rand, 0.24, 0.45), randomChoice([1, 2], rand))
      ]
    };
  }

  if (recipe === 4) {
    const pocketX = randomChance(rand, 0.5) ? randomRange(rand, 0.16, 0.32) : randomRange(rand, 0.68, 0.84);
    return {
      ...base,
      mood: randomChoice(["dim", "soft", "dream"] as MoodKey[], rand),
      shape: "wave",
      colorfulness: Math.round(randomRange(rand, bold ? 54 : 38, bold ? 82 : 68)),
      layers: [
        layer(0, "shadow", pocketX, randomRange(rand, 0.42, 0.6), randomRange(rand, 0.2, 0.34), randomRange(rand, 1.05, 1.72), randomRange(rand, -0.22, 0.22), randomRange(rand, 0.46, 0.78), 1),
        layer(1, "orb", randomRange(rand, 0.46, 0.64), randomRange(rand, 0.5, 0.68), randomRange(rand, 0.18, 0.29), randomRange(rand, 1.1, 1.68), randomRange(rand, -0.14, 0.14), randomRange(rand, 0.36, 0.62), randomChoice([2, 4], rand)),
        layer(2, "band", randomRange(rand, 0.48, 0.62), randomRange(rand, 0.76, 0.9), randomRange(rand, 0.15, 0.24), randomRange(rand, 1.52, 2.2), randomRange(rand, -0.09, 0.09), randomRange(rand, 0.24, 0.44), randomChoice([1, 2], rand))
      ]
    };
  }

  if (recipe === 5) {
    return {
      ...base,
      mood: randomChoice(["dim", "soft"] as MoodKey[], rand),
      shape: "aura",
      colorfulness: Math.round(randomRange(rand, 36, 62)),
      softness: Math.round(randomRange(rand, 9, 15)) + 84,
      layers: [
        layer(0, "orb", randomRange(rand, 0.42, 0.58), randomRange(rand, 0.42, 0.62), randomRange(rand, 0.2, 0.31), randomRange(rand, 1.0, 1.58), randomRange(rand, -0.08, 0.08), randomRange(rand, 0.38, 0.58), randomChoice([3, 4], rand)),
        layer(1, "band", randomRange(rand, 0.42, 0.6), randomRange(rand, 0.74, 0.88), randomRange(rand, 0.12, 0.2), randomRange(rand, 1.45, 2.05), randomRange(rand, -0.08, 0.08), randomRange(rand, 0.18, 0.34), randomChoice([1, 2], rand)),
        layer(2, "shadow", randomRange(rand, 0.08, 0.92), randomRange(rand, 0.44, 0.68), randomRange(rand, 0.22, 0.33), randomRange(rand, 1.25, 2.0), randomRange(rand, -0.18, 0.18), randomRange(rand, 0.22, 0.44), 1)
      ]
    };
  }

  return {
    ...base,
    mood: randomChoice(["soft", "warm", "dream"] as MoodKey[], rand),
    shape: randomChoice(SHAPE_KEYS, rand),
    layers: [
      layer(0, "orb", randomRange(rand, 0.28, 0.45), randomRange(rand, 0.44, 0.62), randomRange(rand, 0.13, 0.22), randomRange(rand, 0.9, 1.45), randomRange(rand, -0.1, 0.1), randomRange(rand, 0.34, 0.6), randomChoice([4, 5], rand)),
      layer(1, "orb", randomRange(rand, 0.58, 0.74), randomRange(rand, 0.42, 0.64), randomRange(rand, 0.12, 0.2), randomRange(rand, 0.9, 1.45), randomRange(rand, -0.1, 0.1), randomRange(rand, 0.28, 0.5), randomChoice([2, 3], rand)),
      layer(2, "band", randomRange(rand, 0.43, 0.6), randomRange(rand, 0.72, 0.86), randomRange(rand, 0.15, 0.24), randomRange(rand, 1.35, 2.05), randomRange(rand, -0.18, 0.18), randomRange(rand, 0.26, 0.48), randomChoice([1, 2], rand)),
      layer(3, "shadow", randomChance(rand, 0.5) ? 0.08 : 0.92, randomRange(rand, 0.46, 0.64), randomRange(rand, 0.2, 0.3), randomRange(rand, 1.28, 1.95), randomRange(rand, -0.2, 0.2), randomRange(rand, 0.22, 0.42), 1)
    ]
  };
}

function varyLayer(layer: GlowLayer, rand: () => number): GlowLayer {
  return {
    ...layer,
    x: clamp(layer.x + randomRange(rand, -0.045, 0.045), 0.03, 0.97),
    y: clamp(layer.y + randomRange(rand, -0.045, 0.045), 0.03, 0.97),
    radius: clamp(layer.radius + randomRange(rand, -0.028, 0.028), 0.04, 0.34),
    stretch: clamp(layer.stretch + randomRange(rand, -0.16, 0.16), 0.35, 2.2),
    rotation: layer.rotation + randomRange(rand, -0.14, 0.14),
    intensity: clamp(layer.intensity + randomRange(rand, -0.08, 0.08), 0, 1)
  };
}

export function WallpaperStudio() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const lastRecipeRef = useRef(-1);
  const [settings, setSettings] = useState<WallpaperSettings>(DEFAULT_SETTINGS);
  const [layers, setLayers] = useState<GlowLayer[]>(DEFAULT_LAYERS);
  const [selectedLayerId, setSelectedLayerId] = useState(DEFAULT_LAYERS[0]?.id ?? "");
  const [tool, setTool] = useState<ToolKey>("select");
  const [toast, setToast] = useState("");
  const [favoriteSeeds, setFavoriteSeeds] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = window.localStorage.getItem("calm-wallpaper-favorites");
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved) as number[];
      return Array.isArray(parsed) ? parsed.filter(Number.isFinite).slice(0, 12) : [];
    } catch {
      window.localStorage.removeItem("calm-wallpaper-favorites");
      return [];
    }
  });
  const resolution = selectedResolution(settings);
  const previewResolution = useMemo(() => previewSizeFor(resolution), [resolution]);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? null;

  useEffect(() => {
    if (!canvasRef.current) return;
    renderWallpaper(canvasRef.current, settings, previewResolution, layers);
  }, [settings, layers, previewResolution]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 1900);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const updateSetting = useCallback(<Key extends keyof WallpaperSettings>(key: Key, value: WallpaperSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const loadGeneratedComposition = useCallback((mode: RandomMode) => {
    const generated = generateComposition(randomSeed(), mode, lastRecipeRef.current);
    lastRecipeRef.current = generated.recipe;
    setSettings((current) => ({
      ...current,
      seed: generated.seed,
      mood: generated.mood,
      palette: generated.palette,
      shape: generated.shape,
      colorfulness: generated.colorfulness,
      softness: generated.softness,
      grain: generated.grain
    }));
    setLayers(generated.layers);
    setSelectedLayerId(generated.layers[0]?.id ?? "");
    setTool("select");
  }, []);

  const randomize = useCallback(() => loadGeneratedComposition("balanced"), [loadGeneratedComposition]);

  const vary = useCallback(() => {
    const nextSeed = settings.seed + 17 + Math.floor(Math.random() * 220);
    const rand = mulberry32(hashSeed(nextSeed, 1201));
    setSettings((current) => ({
      ...current,
      seed: nextSeed,
      colorfulness: clamp(Math.round(current.colorfulness + randomRange(rand, -7, 8)), 0, 100),
      softness: clamp(Math.round(current.softness + randomRange(rand, -4, 5)), 0, 100),
      grain: clamp(Math.round(current.grain + randomRange(rand, -4, 5)), 0, 100)
    }));
    setLayers((current) => current.map((layer) => varyLayer(layer, rand)));
  }, [settings.seed]);

  const soften = useCallback(() => {
    setSettings((current) => ({
      ...current,
      softness: clamp(current.softness + 8, 0, 100),
      colorfulness: clamp(current.colorfulness - 5, 0, 100),
      grain: clamp(current.grain - 5, 0, 100)
    }));
  }, []);

  const surprise = useCallback(() => loadGeneratedComposition("bold"), [loadGeneratedComposition]);

  const copySeed = useCallback(async () => {
    await navigator.clipboard.writeText(String(settings.seed));
    setToast("Seed copied");
  }, [settings.seed]);

  const saveFavorite = useCallback(() => {
    setFavoriteSeeds((current) => {
      const next = [settings.seed, ...current.filter((seed) => seed !== settings.seed)].slice(0, 12);
      window.localStorage.setItem("calm-wallpaper-favorites", JSON.stringify(next));
      return next;
    });
    setToast("Seed saved");
  }, [settings.seed]);

  const loadLatestFavorite = useCallback(() => {
    if (!favoriteSeeds[0]) {
      setToast("No saved seeds yet");
      return;
    }
    updateSetting("seed", favoriteSeeds[0]);
    setToast("Saved seed loaded");
  }, [favoriteSeeds, updateSetting]);

  const download = useCallback(() => {
    const exportCanvas = document.createElement("canvas");
    renderWallpaper(exportCanvas, settings, resolution, layers);
    const link = document.createElement("a");
    link.download = `glow-wallpaper-${settings.seed}-${resolution.width}x${resolution.height}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }, [layers, resolution, settings]);

  const fullscreen = useCallback(async () => {
    if (!canvasRef.current) return;
    if (!document.fullscreenElement) {
      await canvasRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  const canvasPoint = useCallback((event: PointerEvent<HTMLCanvasElement | HTMLButtonElement>) => {
    const frame = canvasRef.current?.getBoundingClientRect();
    if (!frame) return null;
    return {
      x: clamp((event.clientX - frame.left) / frame.width, 0, 1),
      y: clamp((event.clientY - frame.top) / frame.height, 0, 1)
    };
  }, []);

  const hitLayer = useCallback(
    (x: number, y: number) => {
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index];
        const local = rotatePoint(x - layer.x, y - layer.y, -layer.rotation);
        const hitRadius = Math.max(0.06, layer.radius * (layer.kind === "band" ? 0.72 : 0.9));
        const dx = local.x / (hitRadius * Math.max(1, layer.stretch));
        const dy = local.y / hitRadius;
        if (dx * dx + dy * dy <= 1) return layer;
      }
      return null;
    },
    [layers]
  );

  const beginDrag = useCallback(
    (layer: GlowLayer, point: { x: number; y: number }) => {
      setSelectedLayerId(layer.id);
      setTool("select");
      dragRef.current = {
        id: layer.id,
        offsetX: point.x - layer.x,
        offsetY: point.y - layer.y
      };
    },
    []
  );

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const point = canvasPoint(event);
      if (!point) return;
      event.currentTarget.setPointerCapture(event.pointerId);

      if (tool !== "select") {
        const layer = makeLayer(tool, point.x, point.y, settings.palette);
        setLayers((current) => [...current, layer].slice(-8));
        setSelectedLayerId(layer.id);
        setTool("select");
        return;
      }

      const hit = hitLayer(point.x, point.y);
      if (hit) {
        beginDrag(hit, point);
      } else {
        setSelectedLayerId("");
      }
    },
    [beginDrag, canvasPoint, hitLayer, settings.palette, tool]
  );

  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      const point = canvasPoint(event);
      if (!drag || !point) return;
      setLayers((current) =>
        current.map((layer) =>
          layer.id === drag.id
            ? {
                ...layer,
                x: clamp(point.x - drag.offsetX, 0.03, 0.97),
                y: clamp(point.y - drag.offsetY, 0.03, 0.97)
              }
            : layer
        )
      );
    },
    [canvasPoint]
  );

  const stopDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const updateSelectedLayer = useCallback((changes: Partial<GlowLayer>) => {
    setLayers((current) => current.map((layer) => (layer.id === selectedLayerId ? { ...layer, ...changes } : layer)));
  }, [selectedLayerId]);

  const duplicateSelectedLayer = useCallback(() => {
    if (!selectedLayer) return;
    const copy = {
      ...selectedLayer,
      id: `layer-${Date.now()}-${Math.round(Math.random() * 100000)}`,
      x: clamp(selectedLayer.x + 0.055, 0.03, 0.97),
      y: clamp(selectedLayer.y + 0.045, 0.03, 0.97)
    };
    setLayers((current) => [...current, copy].slice(-8));
    setSelectedLayerId(copy.id);
  }, [selectedLayer]);

  const deleteSelectedLayer = useCallback(() => {
    if (!selectedLayerId) return;
    setLayers((current) => {
      const next = current.filter((layer) => layer.id !== selectedLayerId);
      setSelectedLayerId(next.at(-1)?.id ?? "");
      return next;
    });
  }, [selectedLayerId]);

  return (
    <main className="studio-shell">
      <aside className="control-rail" aria-label="Wallpaper controls">
        <div className="rail-header">
          <h1 className="brand">Calm Wallpaper Studio</h1>
          <button className="icon-button" type="button" aria-label="Menu">
            <Menu size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="rail-body">
          <section className="control-section" aria-labelledby="generate-title">
            <div className="section-title" id="generate-title">
              Generate
            </div>
            <div className="generate-grid">
              <ActionButton icon={Shuffle} label="Randomize" onClick={randomize} />
              <ActionButton icon={SlidersHorizontal} label="Variation" onClick={vary} />
              <ActionButton icon={Cloud} label="Soften" onClick={soften} />
              <ActionButton icon={Wand2} label="Surprise" onClick={surprise} />
            </div>
          </section>

          <section className="control-section" aria-labelledby="compose-title">
            <div className="section-title" id="compose-title">
              Compose
              <span>{layers.length}/8</span>
            </div>
            <div className="tool-grid">
              {TOOLS.map((item) => (
                <ActionButton
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => setTool(item.key)}
                  active={tool === item.key}
                />
              ))}
            </div>
            <div className="layer-stack" aria-label="Layer stack">
              {layers.map((layer, index) => (
                <button
                  className={`layer-chip${layer.id === selectedLayerId ? " is-active" : ""}`}
                  key={layer.id}
                  type="button"
                  onClick={() => {
                    setSelectedLayerId(layer.id);
                    setTool("select");
                  }}
                >
                  <span
                    className="layer-chip-swatch"
                    aria-hidden="true"
                    style={{ background: PALETTES[settings.palette].colors[layer.colorIndex] }}
                  />
                  <span>{LAYER_LABELS[layer.kind]}</span>
                  <span className="layer-chip-index">{index + 1}</span>
                </button>
              ))}
            </div>
          </section>

          {selectedLayer ? (
            <section className="control-section" aria-labelledby="layer-title">
              <div className="section-title" id="layer-title">
                Layer
                <span>{LAYER_LABELS[selectedLayer.kind]}</span>
              </div>
              <div className="layer-actions">
                <button className="text-button" type="button" onClick={duplicateSelectedLayer}>
                  <Copy size={15} strokeWidth={1.9} />
                  Copy
                </button>
                <button className="text-button" type="button" onClick={deleteSelectedLayer}>
                  <Trash2 size={15} strokeWidth={1.9} />
                  Delete
                </button>
              </div>
              <div className="mini-swatch-row" aria-label="Layer color">
                {PALETTES[settings.palette].colors.slice(1).map((color, index) => {
                  const colorIndex = index + 1;
                  return (
                    <button
                      className={`mini-swatch${selectedLayer.colorIndex === colorIndex ? " is-active" : ""}`}
                      key={color}
                      type="button"
                      style={{ background: color }}
                      aria-label={`Color ${colorIndex}`}
                      onClick={() => updateSelectedLayer({ colorIndex })}
                    />
                  );
                })}
              </div>
              <div className="slider-row">
                <input
                  className="slider"
                  aria-label="Layer size"
                  type="range"
                  min={4}
                  max={34}
                  value={Math.round(selectedLayer.radius * 100)}
                  onChange={(event) => updateSelectedLayer({ radius: Number(event.target.value) / 100 })}
                />
                <span className="number-readout">{Math.round(selectedLayer.radius * 100)}%</span>
              </div>
              <div className="slider-row">
                <input
                  className="slider"
                  aria-label="Layer spread"
                  type="range"
                  min={35}
                  max={220}
                  value={Math.round(selectedLayer.stretch * 100)}
                  onChange={(event) => updateSelectedLayer({ stretch: Number(event.target.value) / 100 })}
                />
                <span className="number-readout">{Math.round(selectedLayer.stretch * 100)}%</span>
              </div>
              <div className="slider-row">
                <input
                  className="slider"
                  aria-label="Layer intensity"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(selectedLayer.intensity * 100)}
                  onChange={(event) => updateSelectedLayer({ intensity: Number(event.target.value) / 100 })}
                />
                <span className="number-readout">{Math.round(selectedLayer.intensity * 100)}%</span>
              </div>
              <div className="slider-row">
                <input
                  className="slider"
                  aria-label="Layer angle"
                  type="range"
                  min={-90}
                  max={90}
                  value={Math.round((selectedLayer.rotation * 180) / Math.PI)}
                  onChange={(event) => updateSelectedLayer({ rotation: (Number(event.target.value) * Math.PI) / 180 })}
                />
                <span className="number-readout">{Math.round((selectedLayer.rotation * 180) / Math.PI)}°</span>
              </div>
            </section>
          ) : null}

          <section className="control-section" aria-labelledby="seed-title">
            <div className="section-title" id="seed-title">
              Seed
            </div>
            <div className="seed-row">
              <input
                className="seed-input"
                aria-label="Seed"
                inputMode="numeric"
                type="number"
                min={1}
                max={999999}
                value={settings.seed}
                onChange={(event) => updateSetting("seed", clamp(Number(event.target.value) || 1, 1, 999999))}
              />
              <button className="icon-button" type="button" aria-label="Copy seed" onClick={copySeed}>
                <Copy size={17} strokeWidth={1.8} />
              </button>
              <button className="icon-button" type="button" aria-label="New wallpaper" onClick={randomize}>
                <RefreshCw size={17} strokeWidth={1.8} />
              </button>
            </div>
            <div className="slider-row">
              <input
                className="slider"
                aria-label="Seed slider"
                type="range"
                min={1}
                max={999999}
                value={settings.seed}
                onChange={(event) => updateSetting("seed", Number(event.target.value))}
              />
              <span className="number-readout">{settings.seed}</span>
            </div>
          </section>

          <section className="control-section" aria-labelledby="mood-title">
            <div className="section-title" id="mood-title">
              Mood
            </div>
            <div className="mood-grid">
              {Object.entries(MOODS).map(([key, mood]) => (
                <ActionButton
                  key={key}
                  icon={mood.icon}
                  label={mood.label}
                  onClick={() => updateSetting("mood", key as MoodKey)}
                  active={settings.mood === key}
                />
              ))}
            </div>
          </section>

          <section className="control-section" aria-labelledby="palette-title">
            <div className="section-title" id="palette-title">
              Palette
            </div>
            <div className="palette-row">
              {Object.entries(PALETTES).map(([key, palette]) => (
                <button
                  className={`palette-button${settings.palette === key ? " is-active" : ""}`}
                  type="button"
                  key={key}
                  aria-label={palette.label}
                  onClick={() => updateSetting("palette", key as PaletteKey)}
                >
                  <span className="palette-swatch" aria-hidden="true" style={{ background: paletteBackground(palette.colors) }} />
                </button>
              ))}
            </div>
            <div className="slider-row">
              <input
                className="slider"
                aria-label="Glow"
                type="range"
                min={0}
                max={100}
                value={settings.colorfulness}
                onChange={(event) => updateSetting("colorfulness", Number(event.target.value))}
              />
              <span className="number-readout">{settings.colorfulness}%</span>
            </div>
          </section>

          <section className="control-section" aria-labelledby="texture-title">
            <div className="section-title" id="texture-title">
              Texture
            </div>
            <label className="small-muted" htmlFor="shape">
              Shape
            </label>
            <select
              className="select-input"
              id="shape"
              value={settings.shape}
              onChange={(event) => updateSetting("shape", event.target.value as ShapeKey)}
            >
              {Object.entries(SHAPES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <div className="slider-row">
              <input
                className="slider"
                aria-label="Softness"
                type="range"
                min={0}
                max={100}
                value={settings.softness}
                onChange={(event) => updateSetting("softness", Number(event.target.value))}
              />
              <span className="number-readout">{settings.softness}%</span>
            </div>
            <div className="slider-row">
              <input
                className="slider"
                aria-label="Grain"
                type="range"
                min={0}
                max={100}
                value={settings.grain}
                onChange={(event) => updateSetting("grain", Number(event.target.value))}
              />
              <span className="number-readout">{settings.grain}%</span>
            </div>
          </section>

          <section className="control-section" aria-labelledby="resolution-title">
            <div className="section-title" id="resolution-title">
              Resolution
            </div>
            <div className="resolution-grid">
              {RESOLUTIONS.map((item) => (
                <button
                  className={`resolution-button${settings.resolutionKey === item.key ? " is-active" : ""}`}
                  type="button"
                  key={item.key}
                  onClick={() => updateSetting("resolutionKey", item.key)}
                >
                  <span className="resolution-label">{item.label}</span>
                  <span className="resolution-size">{item.sizeLabel}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="control-section" aria-labelledby="export-title">
            <div className="section-title" id="export-title">
              Export
              <span>PNG</span>
            </div>
            <button className="download-button" type="button" onClick={download}>
              <Download size={18} strokeWidth={2} />
              Download Wallpaper
            </button>
          </section>
        </div>

        <div className="rail-footer">
          <div className="footer-actions">
            <button className="text-button" type="button" onClick={saveFavorite}>
              <Heart size={16} strokeWidth={1.9} />
              Save
            </button>
            <button className="text-button" type="button" onClick={fullscreen}>
              <Expand size={16} strokeWidth={1.9} />
              View
            </button>
            <button className="text-button" type="button" onClick={loadLatestFavorite}>
              <Settings size={16} strokeWidth={1.9} />
              Load
            </button>
          </div>
        </div>
      </aside>

      <section className="preview-stage" aria-label="Generated wallpaper preview">
        <div className="canvas-wrap">
          <div className={`canvas-frame tool-${tool}`}>
            <canvas
              className="wallpaper-canvas"
              ref={canvasRef}
              width={previewResolution.width}
              height={previewResolution.height}
              aria-label="Generated calming wallpaper"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            />
            {layers.map((layer) => (
              <span
                className={`layer-handle layer-${layer.kind}${layer.id === selectedLayerId ? " is-selected" : ""}`}
                key={layer.id}
                style={layerHandleStyle(layer)}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="preview-meta" aria-live="polite">
            <span>{resolution.sizeLabel}</span>
            <span>Seed {settings.seed}</span>
            <span>{PALETTES[settings.palette].label}</span>
          </div>
        </div>
      </section>

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  active = false
}: {
  icon: typeof Sun;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button className={`mode-button${active ? " is-active" : ""}`} type="button" onClick={onClick}>
      <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
