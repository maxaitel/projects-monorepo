export type UnsettleSettings = {
  crushSize: number;
  unsettling: number;
  seed: number;
  displacement: number;
  edgeGain: number;
  chroma: number;
};

export type RenderMeta = {
  sourceWidth: number;
  sourceHeight: number;
  crushWidth: number;
  crushHeight: number;
  outputWidth: number;
  outputHeight: number;
};

type SourceImage = HTMLImageElement | ImageBitmap;

const MAX_OUTPUT_EDGE = 1400;
const MIN_OUTPUT_EDGE = 960;

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getSourceSize(source: SourceImage) {
  const image = source as SourceImage & {
    naturalWidth?: number;
    naturalHeight?: number;
  };

  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function fitLongEdge(width: number, height: number, longEdge: number) {
  const scale = longEdge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function getCrushSize(width: number, height: number, longEdge: number) {
  return fitLongEdge(width, height, longEdge);
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, value));
}

function clampIndex(value: number, max: number) {
  return Math.max(0, Math.min(max - 1, Math.round(value)));
}

function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x ^ seed, 374761393) ^ Math.imul(y + seed, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number, scale: number, seed: number) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = sx - x0;
  const ty = sy - y0;
  const easeX = tx * tx * (3 - 2 * tx);
  const easeY = ty * ty * (3 - 2 * ty);
  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * easeX;
  const nx1 = n01 + (n11 - n01) * easeX;
  return nx0 + (nx1 - nx0) * easeY;
}

function sampleChannel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
) {
  const sx = clampIndex(x, width);
  const sy = clampIndex(y, height);
  return pixels[(sy * width + sx) * 4 + channel];
}

function luminanceAt(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  const r = sampleChannel(pixels, width, height, x, y, 0);
  const g = sampleChannel(pixels, width, height, x, y, 1);
  const b = sampleChannel(pixels, width, height, x, y, 2);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function drawToTinyCanvas(source: SourceImage, settings: UnsettleSettings) {
  const sourceSize = getSourceSize(source);
  const crushSize = getCrushSize(
    sourceSize.width,
    sourceSize.height,
    settings.crushSize,
  );
  const tiny = createCanvas(crushSize.width, crushSize.height);
  const tinyContext = tiny.getContext("2d", { willReadFrequently: true });

  if (!tinyContext) {
    throw new Error("Could not create canvas context.");
  }

  tinyContext.imageSmoothingEnabled = true;
  tinyContext.imageSmoothingQuality = "low";
  tinyContext.drawImage(source, 0, 0, crushSize.width, crushSize.height);

  return { tiny, sourceSize, crushSize };
}

export function renderUnsettledImage(
  source: SourceImage,
  crushedCanvas: HTMLCanvasElement,
  outputCanvas: HTMLCanvasElement,
  settings: UnsettleSettings,
): RenderMeta {
  const { tiny, sourceSize, crushSize } = drawToTinyCanvas(source, settings);
  const sourceLongEdge = Math.max(sourceSize.width, sourceSize.height);
  const outputLongEdge = Math.min(
    MAX_OUTPUT_EDGE,
    Math.max(MIN_OUTPUT_EDGE, sourceLongEdge),
  );
  const outputSize = fitLongEdge(
    sourceSize.width,
    sourceSize.height,
    outputLongEdge,
  );

  crushedCanvas.width = outputSize.width;
  crushedCanvas.height = outputSize.height;

  const crushedContext = crushedCanvas.getContext("2d");
  if (!crushedContext) {
    throw new Error("Could not create crushed preview context.");
  }

  crushedContext.imageSmoothingEnabled = false;
  crushedContext.clearRect(0, 0, outputSize.width, outputSize.height);
  crushedContext.drawImage(tiny, 0, 0, outputSize.width, outputSize.height);

  const base = createCanvas(outputSize.width, outputSize.height);
  const baseContext = base.getContext("2d", { willReadFrequently: true });
  const outputContext = outputCanvas.getContext("2d");

  if (!baseContext || !outputContext) {
    throw new Error("Could not create output canvas context.");
  }

  outputCanvas.width = outputSize.width;
  outputCanvas.height = outputSize.height;

  baseContext.imageSmoothingEnabled = true;
  baseContext.imageSmoothingQuality = "high";
  baseContext.drawImage(tiny, 0, 0, outputSize.width, outputSize.height);

  const detail = createCanvas(outputSize.width, outputSize.height);
  const detailContext = detail.getContext("2d", { willReadFrequently: true });

  if (!detailContext) {
    throw new Error("Could not create detail canvas context.");
  }

  detailContext.imageSmoothingEnabled = true;
  detailContext.imageSmoothingQuality = "high";
  detailContext.drawImage(source, 0, 0, outputSize.width, outputSize.height);

  const sourceData = baseContext.getImageData(
    0,
    0,
    outputSize.width,
    outputSize.height,
  );
  const detailData = detailContext.getImageData(
    0,
    0,
    outputSize.width,
    outputSize.height,
  );
  const result = baseContext.createImageData(outputSize.width, outputSize.height);
  const input = sourceData.data;
  const detailPixels = detailData.data;
  const output = result.data;
  const amount = settings.unsettling / 100;
  const displacement =
    (settings.displacement / 100) * amount * Math.max(10, outputSize.width / 72);
  const chromaShift =
    (settings.chroma / 100) * amount * Math.max(1, outputSize.width / 260);
  const edgeGain = settings.edgeGain / 100;
  const seed = Math.max(1, Math.floor(settings.seed));

  for (let y = 0; y < outputSize.height; y += 1) {
    const bandNoise =
      (smoothNoise(0, y, 32 + amount * 30, seed + 17) - 0.5) *
      displacement *
      1.4;

    for (let x = 0; x < outputSize.width; x += 1) {
      const index = (y * outputSize.width + x) * 4;
      const lowNoise = smoothNoise(x, y, 42 - amount * 18, seed + 3);
      const fineNoise = smoothNoise(x, y, 4 + amount * 4, seed + 71);
      const verticalPull =
        (smoothNoise(x, y, 80 - amount * 32, seed + 29) - 0.5) *
        displacement;
      const wave =
        Math.sin((y / Math.max(1, outputSize.height)) * 30 + seed * 0.013) *
        displacement *
        0.22;
      const dx = (lowNoise - 0.5) * displacement * 2 + bandNoise + wave;
      const dy = verticalPull + (fineNoise - 0.5) * displacement * 0.35;
      const sampleX = x + dx;
      const sampleY = y + dy;
      const priorX =
        x +
        dx * 0.34 +
        (smoothNoise(x, y, 12 + amount * 10, seed + 191) - 0.5) *
          amount *
          9;
      const priorY = y + dy * 0.34;

      const lum = luminanceAt(input, outputSize.width, outputSize.height, x, y);
      const edge =
        (Math.abs(
          luminanceAt(input, outputSize.width, outputSize.height, x - 1, y) -
            luminanceAt(input, outputSize.width, outputSize.height, x + 1, y),
        ) +
          Math.abs(
            luminanceAt(input, outputSize.width, outputSize.height, x, y - 1) -
              luminanceAt(input, outputSize.width, outputSize.height, x, y + 1),
          )) /
        255;
      const priorLum = luminanceAt(
        detailPixels,
        outputSize.width,
        outputSize.height,
        priorX,
        priorY,
      );
      const priorEdge =
        (Math.abs(
          luminanceAt(
            detailPixels,
            outputSize.width,
            outputSize.height,
            priorX - 1,
            priorY,
          ) -
            luminanceAt(
              detailPixels,
              outputSize.width,
              outputSize.height,
              priorX + 1,
              priorY,
            ),
        ) +
          Math.abs(
            luminanceAt(
              detailPixels,
              outputSize.width,
              outputSize.height,
              priorX,
              priorY - 1,
            ) -
              luminanceAt(
                detailPixels,
                outputSize.width,
                outputSize.height,
                priorX,
                priorY + 1,
              ),
          )) /
        255;
      const ridge =
        Math.sin((lum + priorLum) * 0.055 + lowNoise * 8 + seed * 0.001) *
        amount *
        (edge + priorEdge * 0.8) *
        edgeGain *
        68;
      const grain = (hash2(x, y, seed + 111) - 0.5) * amount * 34;
      const falseTexture =
        (fineNoise - 0.5) * amount * (16 + edge * 42 + priorEdge * 84);
      const priorMix = amount * 0.44;
      const textureMix = amount * (0.12 + priorEdge * 0.36);

      const baseRed =
        sampleChannel(
          input,
          outputSize.width,
          outputSize.height,
          sampleX - chromaShift,
          sampleY,
          0,
        );
      const baseGreen =
        sampleChannel(
          input,
          outputSize.width,
          outputSize.height,
          sampleX,
          sampleY,
          1,
        );
      const baseBlue =
        sampleChannel(
          input,
          outputSize.width,
          outputSize.height,
          sampleX + chromaShift,
          sampleY,
          2,
        );
      const priorRed = sampleChannel(
        detailPixels,
        outputSize.width,
        outputSize.height,
        priorX,
        priorY,
        0,
      );
      const priorGreen = sampleChannel(
        detailPixels,
        outputSize.width,
        outputSize.height,
        priorX,
        priorY,
        1,
      );
      const priorBlue = sampleChannel(
        detailPixels,
        outputSize.width,
        outputSize.height,
        priorX,
        priorY,
        2,
      );
      const priorGray = priorRed * 0.3 + priorGreen * 0.59 + priorBlue * 0.11;

      let red =
        baseRed * (1 - priorMix) +
        priorRed * priorMix +
        (priorRed - priorGray) * textureMix +
        ridge +
        grain;
      let green =
        baseGreen * (1 - priorMix) +
        priorGreen * priorMix +
        (priorGreen - priorGray) * textureMix +
        falseTexture -
        ridge * 0.14;
      let blue =
        baseBlue * (1 - priorMix) +
        priorBlue * priorMix +
        (priorBlue - priorGray) * textureMix -
        ridge * 0.45 +
        grain * 0.35;

      const gray = red * 0.3 + green * 0.59 + blue * 0.11;
      const saturation = 1 - amount * 0.28;
      red = gray + (red - gray) * saturation + amount * 10;
      green = gray + (green - gray) * saturation + amount * 6;
      blue = gray + (blue - gray) * saturation - amount * 18;

      output[index] = clampByte(red);
      output[index + 1] = clampByte(green);
      output[index + 2] = clampByte(blue);
      output[index + 3] = 255;
    }
  }

  outputContext.clearRect(0, 0, outputSize.width, outputSize.height);
  outputContext.putImageData(result, 0, 0);

  return {
    sourceWidth: sourceSize.width,
    sourceHeight: sourceSize.height,
    crushWidth: crushSize.width,
    crushHeight: crushSize.height,
    outputWidth: outputSize.width,
    outputHeight: outputSize.height,
  };
}

export function formatDimensions(width: number, height: number) {
  return `${width}x${height}`;
}
