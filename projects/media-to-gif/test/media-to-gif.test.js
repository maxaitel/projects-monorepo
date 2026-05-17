import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCaptionSvg,
  buildFfmpegArgs,
  defaultOutputFor,
  normalizeOptions,
  parseArgs,
  usage,
  wrapCaptionText
} from '../src/media-to-gif.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('parseArgs', () => {
  it('accepts input, output, and meme caption options', () => {
    const options = parseArgs([
      'clip.mp4',
      '-o',
      'out.gif',
      '--caption',
      'Billions must love',
      '--caption-position',
      'top',
      '--caption-size',
      '64',
      '--caption-padding',
      '30',
      '--caption-wrap',
      '22',
      '--width',
      '480',
      '--fps',
      '15',
      '--start',
      '1.25',
      '--duration',
      '3'
    ]);

    assert.equal(options.input, 'clip.mp4');
    assert.equal(options.output, 'out.gif');
    assert.equal(options.width, 480);
    assert.equal(options.fps, 15);
    assert.equal(options.start, 1.25);
    assert.equal(options.duration, 3);
    assert.deepEqual(options.caption, {
      text: 'Billions must love',
      position: 'top',
      font: undefined,
      fontSize: 64,
      color: 'black',
      background: 'white',
      padding: 30,
      height: undefined,
      wrap: 22
    });
  });

  it('rejects invalid caption positions', () => {
    assert.throws(
      () => parseArgs(['clip.mp4', '--caption', 'hello', '--caption-position', 'middle']),
      /caption-position must be top or bottom/
    );
  });
});

describe('short command', () => {
  it('advertises img2gif with -c as the short caption command', () => {
    assert.match(usage(), /img2gif <input> \[output\.gif\] \[options\]/);
    assert.match(usage(), /img2gif gif\.gif -c "shut down that computer boy"/);
  });

  it('exposes img2gif as a package binary alias', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

    assert.equal(packageJson.bin.img2gif, './bin/media-to-gif.js');
    assert.equal(packageJson.bin['media-to-gif'], './bin/media-to-gif.js');
  });
});

describe('defaultOutputFor', () => {
  it('replaces a non-gif extension with .gif', () => {
    assert.equal(defaultOutputFor('/tmp/source clip.mp4'), '/tmp/source clip.gif');
  });

  it('does not overwrite the input path when the input is already a gif', () => {
    assert.equal(defaultOutputFor('/tmp/source.gif'), '/tmp/source.out.gif');
  });
});

describe('buildFfmpegArgs', () => {
  it('creates a top caption bar and palette pipeline for video input', () => {
    const options = normalizeOptions({
      input: 'clip.mp4',
      output: 'out.gif',
      width: 480,
      fps: 12,
      duration: 2,
      overwrite: true,
      gifLoop: 0,
      caption: {
        text: 'Billions must love',
        position: 'top',
        fontSize: 48,
        color: 'black',
        background: 'white',
        padding: 24,
        height: 108,
        wrap: 0
      }
    });

    const args = buildFfmpegArgs(options);
    const filter = args.at(args.indexOf('-filter_complex') + 1);

    assert.deepEqual(args.slice(0, 7), ['-hide_banner', '-loglevel', 'error', '-y', '-i', 'clip.mp4', '-t']);
    assert.equal(args[7], '2');
    assert.match(filter, /fps=12/);
    assert.match(filter, /scale=480:-2:flags=lanczos/);
    assert.match(filter, /pad=iw:ih\+108:0:108:color=white/);
    assert.match(filter, /drawtext=/);
    assert.match(filter, /text=Billions must love/);
    assert.match(filter, /fontcolor=black/);
    assert.match(filter, /fontsize=48/);
    assert.match(filter, /palettegen=/);
    assert.match(filter, /paletteuse=/);
    assert.equal(args.at(-1), 'out.gif');
  });

  it('loops static image input and applies a default duration', () => {
    const options = normalizeOptions({
      input: 'image.jpeg',
      output: 'image.gif',
      width: 320,
      fps: 8,
      overwrite: true,
      gifLoop: 0
    });

    const args = buildFfmpegArgs(options);

    assert.deepEqual(args.slice(0, 10), [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-loop',
      '1',
      '-t',
      '2.5',
      '-i',
      'image.jpeg'
    ]);
  });

  it('can use a generated caption image overlay instead of drawtext', () => {
    const options = normalizeOptions({
      input: 'clip.mp4',
      output: 'out.gif',
      width: 320,
      fps: 10,
      overwrite: true,
      gifLoop: 0,
      caption: {
        text: 'Billions must love',
        position: 'top',
        fontSize: 42,
        color: 'black',
        background: 'white',
        padding: 16,
        height: 82,
        wrap: 0
      }
    });

    const args = buildFfmpegArgs(options, { captionImage: '/tmp/caption.png' });
    const filter = args.at(args.indexOf('-filter_complex') + 1);
    const captionInputIndex = args.indexOf('/tmp/caption.png');

    assert.equal(args[captionInputIndex - 3], '-loop');
    assert.equal(args[captionInputIndex - 2], '1');
    assert.equal(args[captionInputIndex - 1], '-i');
    assert.match(filter, /pad=iw:ih\+82:0:82:color=white\[base\]/);
    assert.match(filter, /\[base\]\[1:v\]overlay=0:0:format=auto:shortest=1/);
    assert.doesNotMatch(filter, /drawtext=/);
  });
});

describe('buildCaptionSvg', () => {
  it('renders a bold centered SVG caption bar with escaped text', () => {
    const svg = buildCaptionSvg(
      {
        text: 'Billions & <love>',
        position: 'top',
        fontSize: 42,
        color: 'black',
        background: 'white',
        padding: 16,
        height: 82,
        wrap: 0
      },
      { width: 320 }
    );

    assert.match(svg, /<svg[^>]+width="320"[^>]+height="82"/);
    assert.match(svg, /font-weight="900"/);
    assert.match(svg, /font-family="Impact, Arial Black, Arial, sans-serif"/);
    assert.match(svg, /Billions &amp; &lt;love&gt;/);
  });
});

describe('wrapCaptionText', () => {
  it('wraps caption text by words when requested', () => {
    assert.equal(
      wrapCaptionText('Billions must love this very specific thing', 18),
      'Billions must love\nthis very specific\nthing'
    );
  });

  it('preserves manual line breaks', () => {
    assert.equal(wrapCaptionText('Billions must love\nmanual lines', 30), 'Billions must love\nmanual lines');
  });
});
