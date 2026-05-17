# img2gif

CLI for turning common media inputs into GIFs with optional meme-style captions.

It uses `ffmpeg`, so anything your local `ffmpeg` can read is fair game: `mp4`, `mov`,
`gif`, `png`, `jpeg`, `webp`, `avif`, and more.

## Requirements

- Node.js 20+
- `ffmpeg` on your `PATH`
- For captions: either `rsvg-convert` on your `PATH`, or an `ffmpeg` build with the
  `drawtext` filter

## Usage

Install the short command from the project directory:

```bash
cd projects/media-to-gif
npm link
```

Then use it directly:

```bash
img2gif gif.gif -c "shut down that computer boy"
```

Create a top-caption GIF:

```bash
img2gif input.mp4 billions.gif -c "Billions must love"
```

Convert a still image into a short GIF:

```bash
img2gif image.jpeg image.gif -c "Static image caption" --duration 2
```

Preview the generated `ffmpeg` command:

```bash
img2gif input.mp4 -c "Preview" --dry-run
```

## Options

Run:

```bash
img2gif --help
```
