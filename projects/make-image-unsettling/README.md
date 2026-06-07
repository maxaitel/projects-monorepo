# Make Image Unsettling

Prototype website for `MakeImageUnsettling.com`.

The app runs entirely in the browser. It loads an image, crushes the long edge down to a tiny pixel count, then reconstructs the image with a deterministic canvas pipeline that adds warped smoothing, a weak detail prior from the uploaded image, false detail, grain, and chromatic offsets. The result is meant to mimic the "AI upscaler hallucinated the missing details" look from the reference meme.

## What Works

- Upload or drag in a local image.
- Use the included generated demo image.
- Adjust crush size, unsettling amount, seed, warp, false detail, and color offset.
- Preview the crushed input and reconstructed result.
- Download the output PNG.

## What This Is Not

This version does not run a trained neural network and does not call a hosted AI API. It is a local prototype with a deterministic canvas effect, so fresh clones work without credentials, GPUs, network access, or private services.

The demo image at `public/demo-church.png` was generated for this prototype and is committed as a small sample asset.

## Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Verification

```bash
npm run lint
npm run build
```
