import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VERSION = '0.1.0';

const STATIC_IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp'
]);

const DEFAULT_WIDTH = 640;
const DEFAULT_FPS = 12;
const DEFAULT_IMAGE_DURATION = 2.5;
const DEFAULT_GIF_LOOP = 0;
const DEFAULT_CAPTION_FONT_SIZE = 64;
const DEFAULT_CAPTION_PADDING = 24;
const DEFAULT_CAPTION_COLOR = 'black';
const DEFAULT_CAPTION_BACKGROUND = 'white';
const DEFAULT_CAPTION_POSITION = 'top';

const CAPTION_POSITIONS = new Set(['top', 'bottom']);

const COMMON_BOLD_FONTS = [
  '/System/Library/Fonts/Supplemental/Arial Black.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/Library/Fonts/Arial Black.ttf',
  '/Library/Fonts/Impact.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'
];

export function defaultOutputFor(input) {
  const parsed = path.parse(input);
  const suffix = parsed.ext.toLowerCase() === '.gif' ? '.out.gif' : '.gif';
  return path.format({
    dir: parsed.dir,
    name: parsed.name || parsed.base,
    ext: suffix
  });
}

export function parseArgs(argv) {
  const options = {
    input: undefined,
    output: undefined,
    width: DEFAULT_WIDTH,
    fps: DEFAULT_FPS,
    start: undefined,
    duration: undefined,
    overwrite: true,
    dryRun: false,
    gifLoop: DEFAULT_GIF_LOOP,
    caption: undefined,
    help: false,
    version: false
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith('-') || token === '-') {
      positionals.push(token);
      continue;
    }

    const [name, inlineValue] = splitInlineOption(token);
    const readValue = () => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      index += 1;
      if (index >= argv.length || argv[index].startsWith('-')) {
        throw new Error(`${name} requires a value`);
      }
      return argv[index];
    };

    switch (name) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '--version':
        options.version = true;
        break;
      case '-o':
      case '--output':
        options.output = readValue();
        break;
      case '-w':
      case '--width':
        options.width = parsePositiveInteger(readValue(), name);
        break;
      case '--fps':
        options.fps = parsePositiveNumber(readValue(), name);
        break;
      case '--start':
        options.start = parseNonNegativeNumber(readValue(), name);
        break;
      case '--duration':
        options.duration = parsePositiveNumber(readValue(), name);
        break;
      case '--gif-loop':
        options.gifLoop = parseNonNegativeInteger(readValue(), name);
        break;
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--no-overwrite':
        options.overwrite = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-c':
      case '--caption':
        ensureCaption(options).text = readValue();
        break;
      case '--caption-position':
        ensureCaption(options).position = parseCaptionPosition(readValue());
        break;
      case '--caption-font':
        ensureCaption(options).font = readValue();
        break;
      case '--caption-size':
        ensureCaption(options).fontSize = parsePositiveInteger(readValue(), name);
        break;
      case '--caption-color':
        ensureCaption(options).color = readValue();
        break;
      case '--caption-bg':
      case '--caption-background':
        ensureCaption(options).background = readValue();
        break;
      case '--caption-padding':
        ensureCaption(options).padding = parseNonNegativeInteger(readValue(), name);
        break;
      case '--caption-height':
        ensureCaption(options).height = parsePositiveInteger(readValue(), name);
        break;
      case '--caption-wrap':
        ensureCaption(options).wrap = parseNonNegativeInteger(readValue(), name);
        break;
      default:
        throw new Error(`Unknown option: ${name}`);
    }
  }

  if (positionals.length > 2) {
    throw new Error(`Expected input and optional output, received ${positionals.length} positional arguments`);
  }

  if (positionals[0]) {
    options.input = positionals[0];
  }

  if (positionals[1]) {
    if (options.output) {
      throw new Error('Output was provided twice');
    }
    options.output = positionals[1];
  }

  if (!options.help && !options.version && !options.input) {
    throw new Error('Input file is required');
  }

  if (options.caption && !options.caption.text) {
    throw new Error('Caption options require --caption text');
  }

  return options;
}

export function normalizeOptions(rawOptions) {
  const input = rawOptions.input;

  if (!input) {
    throw new Error('Input file is required');
  }

  const isImage = isStaticImage(input);
  const width = rawOptions.width ?? DEFAULT_WIDTH;
  const fps = rawOptions.fps ?? DEFAULT_FPS;
  const duration = rawOptions.duration ?? (isImage ? DEFAULT_IMAGE_DURATION : undefined);
  const output = rawOptions.output ?? defaultOutputFor(input);
  const overwrite = rawOptions.overwrite ?? true;
  const gifLoop = rawOptions.gifLoop ?? DEFAULT_GIF_LOOP;

  return {
    input,
    output,
    width,
    fps,
    start: rawOptions.start,
    duration,
    overwrite,
    dryRun: rawOptions.dryRun ?? false,
    gifLoop,
    isStaticImage: isImage,
    caption: normalizeCaption(rawOptions.caption)
  };
}

export function buildFfmpegArgs(rawOptions, renderOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const filter = buildGifFilter(options, renderOptions);
  const args = ['-hide_banner', '-loglevel', 'error', options.overwrite ? '-y' : '-n'];

  if (options.start !== undefined) {
    args.push('-ss', formatNumber(options.start));
  }

  if (options.isStaticImage) {
    args.push('-loop', '1', '-t', formatNumber(options.duration));
  }

  args.push('-i', options.input);

  if (renderOptions.captionImage) {
    args.push('-loop', '1', '-i', renderOptions.captionImage);
  }

  if (!options.isStaticImage && options.duration !== undefined) {
    args.push('-t', formatNumber(options.duration));
  }

  args.push(
    '-filter_complex',
    filter,
    '-map',
    '[gif]',
    '-an',
    '-loop',
    String(options.gifLoop),
    options.output
  );

  return args;
}

export function wrapCaptionText(text, maxChars) {
  const normalized = String(text).replace(/\r\n?/g, '\n');

  if (!maxChars || maxChars <= 0) {
    return normalized;
  }

  return normalized
    .split('\n')
    .flatMap((line) => wrapCaptionLine(line, maxChars))
    .join('\n');
}

export function buildCaptionSvg(caption, { width }) {
  const lines = caption.text.split('\n');
  const lineHeight = Math.round(caption.fontSize * 1.12);
  const centerX = width / 2;
  const firstLineY = caption.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map((line, index) => {
      const y = Math.round(firstLineY + index * lineHeight);
      return `<tspan x="${centerX}" y="${y}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${caption.height}" viewBox="0 0 ${width} ${caption.height}">
  <rect width="100%" height="100%" fill="${escapeXmlAttribute(caption.background)}"/>
  <text text-anchor="middle" dominant-baseline="middle" font-family="Impact, Arial Black, Arial, sans-serif" font-size="${caption.fontSize}" font-weight="900" fill="${escapeXmlAttribute(caption.color)}">${tspans}</text>
</svg>
`;
}

export function usage(commandName = 'img2gif') {
  return `Usage:
  ${commandName} <input> [output.gif] [options]

Examples:
  ${commandName} gif.gif -c "shut down that computer boy"
  ${commandName} image.png out.gif -c "Top text" --duration 2
  ${commandName} clip.mp4 -o meme.gif --start 1.5 --duration 4 --fps 15 --width 540

Options:
  -o, --output <path>              Output GIF path
  -w, --width <px>                 Output width before caption padding (default: 640)
      --fps <n>                    GIF frame rate (default: 12)
      --start <seconds>            Start offset for video input
      --duration <seconds>         Clip length; image inputs default to 2.5 seconds
      --gif-loop <count>           GIF loop count, 0 means forever (default: 0)
      --no-overwrite               Refuse to overwrite output
      --dry-run                    Print ffmpeg command without running it
  -c, --caption <text>             Add meme-style caption text
      --caption-position <top|bottom>
                                   Caption bar location (default: top)
      --caption-font <path>        Font file path
      --caption-size <px>          Caption font size (default: 64)
      --caption-color <color>      Caption text color (default: black)
      --caption-bg <color>         Caption bar color (default: white)
      --caption-padding <px>       Caption bar padding (default: 24)
      --caption-height <px>        Fixed caption bar height
      --caption-wrap <chars>       Word-wrap caption at roughly this many characters
  -h, --help                       Show help
      --version                    Show version`;
}

export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const commandName = io.commandName ?? 'img2gif';
  let cleanupCaptionImage;

  try {
    const parsed = parseArgs(argv);

    if (parsed.help) {
      stdout.write(`${usage(commandName)}\n`);
      return 0;
    }

    if (parsed.version) {
      stdout.write(`${VERSION}\n`);
      return 0;
    }

    const options = normalizeOptions(parsed);
    const renderOptions = {};

    if (options.caption) {
      if (await commandAvailable(io.rsvgPath ?? 'rsvg-convert', ['--version'], io.spawn ?? spawn)) {
        const rendered = await renderCaptionImage(options.caption, {
          width: options.width,
          rsvgPath: io.rsvgPath,
          spawn: io.spawn
        });
        renderOptions.captionImage = rendered.path;
        cleanupCaptionImage = rendered.cleanup;
      } else if (!(await ffmpegSupportsDrawtext(io.ffmpegPath ?? 'ffmpeg', io.spawn ?? spawn))) {
        throw new Error('Captions require either rsvg-convert on PATH or an ffmpeg build with the drawtext filter.');
      }
    }

    const args = buildFfmpegArgs(options, renderOptions);

    if (options.dryRun) {
      stdout.write(`${formatCommand('ffmpeg', args)}\n`);
      return 0;
    }

    await runFfmpeg(args, io);
    stdout.write(`Wrote ${options.output}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${commandName}: ${error.message}\n\n${usage(commandName)}\n`);
    return 1;
  } finally {
    cleanupCaptionImage?.();
  }
}

export function runFfmpeg(args, io = {}) {
  const spawnImpl = io.spawn ?? spawn;
  const ffmpegPath = io.ffmpegPath ?? 'ffmpeg';

  return new Promise((resolve, reject) => {
    const child = spawnImpl(ffmpegPath, args, {
      stdio: ['ignore', 'inherit', 'inherit']
    });

    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('ffmpeg was not found on PATH. Install ffmpeg and try again.'));
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

export async function renderCaptionImage(caption, io = {}) {
  const width = io.width;

  if (!width) {
    throw new Error('Caption image rendering requires a width');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-to-gif-'));
  const svgPath = path.join(tempDir, 'caption.svg');
  const pngPath = path.join(tempDir, 'caption.png');
  fs.writeFileSync(svgPath, buildCaptionSvg(caption, { width }), 'utf8');

  await runCommand(io.rsvgPath ?? 'rsvg-convert', ['-o', pngPath, svgPath], {
    spawn: io.spawn
  });

  return {
    path: pngPath,
    cleanup: () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

function splitInlineOption(token) {
  const equalsAt = token.indexOf('=');

  if (equalsAt === -1) {
    return [token, undefined];
  }

  return [token.slice(0, equalsAt), token.slice(equalsAt + 1)];
}

function ensureCaption(options) {
  if (!options.caption) {
    options.caption = {
      text: undefined,
      position: DEFAULT_CAPTION_POSITION,
      font: undefined,
      fontSize: DEFAULT_CAPTION_FONT_SIZE,
      color: DEFAULT_CAPTION_COLOR,
      background: DEFAULT_CAPTION_BACKGROUND,
      padding: DEFAULT_CAPTION_PADDING,
      height: undefined,
      wrap: 0
    };
  }

  return options.caption;
}

function parseCaptionPosition(value) {
  if (!CAPTION_POSITIONS.has(value)) {
    throw new Error('caption-position must be top or bottom');
  }
  return value;
}

function parsePositiveInteger(value, optionName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return number;
}

function parseNonNegativeInteger(value, optionName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return number;
}

function parsePositiveNumber(value, optionName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${optionName} must be a positive number`);
  }
  return number;
}

function parseNonNegativeNumber(value, optionName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${optionName} must be a non-negative number`);
  }
  return number;
}

function normalizeCaption(rawCaption) {
  if (!rawCaption?.text) {
    return undefined;
  }

  const fontSize = rawCaption.fontSize ?? DEFAULT_CAPTION_FONT_SIZE;
  const padding = rawCaption.padding ?? DEFAULT_CAPTION_PADDING;
  const wrap = rawCaption.wrap ?? 0;
  const text = wrapCaptionText(rawCaption.text, wrap);
  const lineCount = Math.max(1, text.split('\n').length);
  const height = rawCaption.height ?? Math.ceil(lineCount * fontSize * 1.2 + padding * 2);

  return {
    text,
    position: rawCaption.position ?? DEFAULT_CAPTION_POSITION,
    font: rawCaption.font ?? findDefaultCaptionFont(),
    fontSize,
    color: rawCaption.color ?? DEFAULT_CAPTION_COLOR,
    background: rawCaption.background ?? DEFAULT_CAPTION_BACKGROUND,
    padding,
    height,
    wrap
  };
}

function buildGifFilter(options, renderOptions = {}) {
  const chain = [
    `[0:v]fps=${formatNumber(options.fps)}`,
    `scale=${options.width}:-2:flags=lanczos`,
    'setsar=1'
  ];

  if (options.caption && renderOptions.captionImage) {
    chain.push(buildCaptionPadFilter(options.caption));
    return `${chain.join(',')}[base];[base][1:v]overlay=0:${captionOverlayY(options.caption)}:format=auto:shortest=1,split[s0][s1];[s0]palettegen=stats_mode=diff:max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5[gif]`;
  }

  if (options.caption) {
    chain.push(...buildCaptionFilters(options.caption));
  }

  return `${chain.join(',')},split[s0][s1];[s0]palettegen=stats_mode=diff:max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5[gif]`;
}

function buildCaptionFilters(caption) {
  const textY =
    caption.position === 'top'
      ? `(${caption.height}-text_h)/2`
      : `h-${caption.height}+(${caption.height}-text_h)/2`;
  const lineSpacing = Math.max(0, Math.round(caption.fontSize * 0.08));

  return [
    buildCaptionPadFilter(caption),
    `drawtext=${buildDrawTextOptions(caption, textY, lineSpacing)}`
  ];
}

function buildCaptionPadFilter(caption) {
  const yOffset = caption.position === 'top' ? caption.height : 0;
  return `pad=iw:ih+${caption.height}:0:${yOffset}:color=${escapeFilterValue(caption.background)}`;
}

function captionOverlayY(caption) {
  return caption.position === 'top' ? '0' : 'H-h';
}

function buildDrawTextOptions(caption, y, lineSpacing) {
  const options = [];

  if (caption.font) {
    options.push(`fontfile=${escapeFilterValue(caption.font)}`);
  }

  options.push(
    `text=${escapeFilterValue(caption.text)}`,
    'x=(w-text_w)/2',
    `y=${y}`,
    `fontsize=${caption.fontSize}`,
    `fontcolor=${escapeFilterValue(caption.color)}`,
    `line_spacing=${lineSpacing}`
  );

  return options.join(':');
}

function escapeFilterValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/;/g, '\\;');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttribute(value) {
  return escapeXml(value).replace(/"/g, '&quot;');
}

function wrapCaptionLine(line, maxChars) {
  if (line.length <= maxChars) {
    return [line];
  }

  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }

  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function isStaticImage(input) {
  return STATIC_IMAGE_EXTENSIONS.has(path.extname(input).toLowerCase());
}

function findDefaultCaptionFont() {
  return COMMON_BOLD_FONTS.find((fontPath) => fs.existsSync(fontPath));
}

function formatNumber(value) {
  return Number(value).toString();
}

function formatCommand(command, args) {
  return [command, ...args].map(shellQuote).join(' ');
}

function commandAvailable(command, args, spawnImpl) {
  return runCommand(command, args, { spawn: spawnImpl, stdio: 'ignore' })
    .then(() => true)
    .catch(() => false);
}

async function ffmpegSupportsDrawtext(ffmpegPath, spawnImpl) {
  try {
    const output = await collectCommandOutput(ffmpegPath, ['-hide_banner', '-filters'], {
      spawn: spawnImpl
    });
    return /\bdrawtext\b/.test(output);
  } catch {
    return false;
  }
}

function runCommand(command, args, io = {}) {
  const spawnImpl = io.spawn ?? spawn;

  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      stdio: io.stdio ?? ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';

    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

function collectCommandOutput(command, args, io = {}) {
  const spawnImpl = io.spawn ?? spawn;

  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      output += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(`${output}\n${stderr}`);
        return;
      }
      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
