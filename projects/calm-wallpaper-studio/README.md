# Calm Wallpaper Studio

Calm Wallpaper Studio is a small local Next.js app for making quiet procedural wallpapers. It is a working prototype, not an AI image generator and not a hosted production service.

The app renders dark, soft-glow abstract wallpapers in the browser with a seeded canvas renderer. The style is based on the supplied phone lockscreen references: black falloff, blurred optical bloom, warm/cool glow presets, and subtle low-light grain. You can randomize a full editable composition, place glow/shade layers on the canvas, tune each layer, pick a resolution, and download a PNG.

## What Works

- Seeded generation: the same seed and settings produce the same wallpaper.
- Randomize creates a full composition by changing mood, palette, base shape, seed, and editable layers.
- Variation nudges the current composition without throwing it away.
- Soften and surprise controls for quick direction changes.
- Mood, reference-related palette presets, glow, texture, grain, and softness controls.
- Manual composition tools for glow, capsule, band, and shade layers.
- Layer selection, moving, duplication, deletion, color, size, spread, intensity, and angle controls.
- Desktop, phone, square, and 4K PNG export.
- Local saved seeds through `localStorage`.

## What This Does Not Do

- It does not call an external AI image model.
- It does not copy or sample pixels from the attached reference images; the renderer is a procedural approximation of their soft glow style.
- It does not upload, store, or sync generated images.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Next.js.

## Verify

```bash
npm run build
npm run lint
```

Fresh clones need Node.js and npm. No API keys or external services are required after dependencies are installed.
