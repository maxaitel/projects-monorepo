# Wallforge

Procedural Python CLI for making high-resolution soft-gradient wallpapers for a Mac and a phone.

Wallforge renders PNGs locally from deterministic math, NumPy, and Pillow. It is not an AI image
generator and does not call external services.

## What Works

- Generates desktop and phone wallpapers in one command.
- Includes four soft blurred light styles:
  - `vista`: calm macOS-like blue, tan, orange, red, and purple desktop gradients.
  - `bloom`, `wave`, and `capsule`: brighter abstract glow variants.
- Uses deterministic seeds, so a wallpaper can be regenerated exactly.
- Outputs high-resolution PNGs for:
  - `mac`: 6016x3384
  - `macbook`: 3456x2234
  - `phone`: 1290x2796
- Supports custom sizes with `--target custom --size WIDTHxHEIGHT`.

## Limits

- This is a local procedural wallpaper generator, not a general image model.
- The default `balanced` quality renders at an intermediate working resolution, then upscales and
  adds final grain. Use `--quality ultra` for slower, denser rendering.
- Generated wallpapers are intentionally ignored by git. Regenerate them with the commands below.

## Setup

From this project directory:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e .
```

If NumPy and Pillow are already available in your Python environment, you can also run the module
directly from this directory.

## Usage

Generate one screenshot-inspired Mac wallpaper:

```bash
python3 -m wallforge --style vista --target mac --seed sunday-desk --out wallpapers
```

Generate one wallpaper per style for both Mac and phone:

```bash
python3 -m wallforge --style all --target all --seed highres-reference --out wallpapers/reference-match
```

Generate a small batch with repeatable variations:

```bash
python3 -m wallforge --style all --target all --count 3 --seed highres-reference --out wallpapers/reference-match
```

Generate a MacBook-sized rounded capsule wallpaper:

```bash
python3 -m wallforge --style capsule --target macbook --seed solar-drift --out wallpapers
```

Generate a custom phone size:

```bash
python3 -m wallforge --style wave --target custom --size 1179x2556 --seed prism-01 --out wallpapers
```

After installation, the same CLI is available as:

```bash
wallforge --style vista --target mac --seed sunday-desk --out wallpapers
```

## Verification

```bash
python3 -m unittest discover -s tests
python3 -m wallforge --style vista --target custom --size 320x180 --seed smoke-test --out /tmp/wallforge-smoke
```

Generated wallpapers are safe to delete and regenerate. No credentials, network, GPUs, or hidden
local files are required beyond Python, NumPy, and Pillow.
