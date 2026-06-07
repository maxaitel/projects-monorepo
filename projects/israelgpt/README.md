# IsraelGPT Android Prototype

This is a small native Android prototype for the user-requested `isrealgpt` idea. Public references spell the meme as `IsraelGPT`, so the app uses that spelling while documenting the mismatch here.

## What It Is

The app is a local parody/meme generator with a short research brief. It does not connect to OpenAI, `israelgpt.org`, or any hosted language model.

Research checked on June 7, 2026:

- Know Your Meme describes IsraelGPT as a 2025 X/Twitter phrasal-template meme where users prompt a make-believe ChatGPT variant to generate disliked media, teams, genres, or products.
- `israelgpt.org` visibly presents "ISRAEL GPT" and "INTELLIGENCE TERMINAL", but I did not find enough public context to treat it as an established service.
- Scamadviser and Gridinsoft-style reputation pages describe `israelgpt.org` as a young domain and advise caution or verification.

## What Works

- Runs as a single-screen native Android app.
- Generates IsraelGPT-style parody text fully on device.
- Lets the user edit the category, constraint, and generated result name.
- Supports random prompt filling, copy, and Android share sheet.
- Includes no ads, accounts, analytics, network calls, or API keys.

## Build

Requirements:

- JDK 17.
- Android SDK platform 36 and build tools 36.0.0.
- Gradle can be supplied by the checked-in wrapper. A fresh machine may need network access for Gradle and Android Gradle Plugin downloads.

From this directory:

```sh
./gradlew :app:assembleDebug
```

The debug APK is created at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Verification

I verified this as a prototype with:

```sh
./gradlew :app:assembleDebug
./gradlew :app:lintDebug
```

I also installed and launched the debug APK on the local `Codex_QA_API35` emulator. UI-tree checks confirmed the title, research panel, generator fields, output text, Random action, and scrolled Copy/Share buttons were present. The emulator crash buffer was empty after interaction. This repository does not include Play Store packaging.

## Limits

This is not a production app. It is an experiment/prototype that captures the researched meme format and provides a small usable Android surface. It has no moderation service, no backend persistence, and no claim of being an official AI product.
