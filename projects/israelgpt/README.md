# IsraelGPT Android Prototype

This is a small native Android prototype for the user-requested `isrealgpt` idea. Public references spell the meme as `IsraelGPT`, so the app uses that spelling while documenting the mismatch here.

## What It Is

The app is an unofficial, satirical Android chat terminal for a local Ollama server. It does not connect to OpenAI, `israelgpt.org`, or any hosted language model.

The current build targets:

```text
http://100.116.25.114:11434
```

The app calls Ollama's `/api/tags` endpoint to check connectivity and `/api/chat` to send prompts. The model currently defaults to `llama3.2`.

## Persona

Requests are sent with a built-in system persona named IsraelGPT. The persona is a concise, deadpan terminal voice that can be satirical when the prompt invites it. It is explicitly instructed not to claim official status, impersonate a government or real organization, invent live intelligence/private sources, or help with hate, harassment, dehumanization, demographic-targeted political persuasion, or harm.

## What Works

- Runs as a single-screen native Android app.
- Shows a Star of David header emblem and matching launcher foreground detail.
- Checks whether the configured Ollama server is reachable.
- Sends chat prompts to `http://100.116.25.114:11434/api/chat`.
- Uses `llama3.2` as the default Ollama model.
- Preserves the visible transcript through rotation.
- Supports Clear and Copy actions.

## External Requirements

A fresh clone can build the APK, but chat responses require external state:

- The Android device or emulator must be able to reach `100.116.25.114`.
- Ollama must be running on that host and listening on port `11434`.
- The selected model, default `llama3.2`, must be installed on that Ollama machine.
- The Ollama server must allow connections from the Android device or emulator.

For a LAN/Tailscale-style Ollama host, that usually means starting Ollama with a reachable bind address, for example:

```sh
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

Then confirm the model exists:

```sh
ollama list
ollama pull llama3.2
```

## Design Mockup

The UI direction was mocked with the built-in Codex `imagegen` tool and saved here:

```text
docs/design/israelgpt-ui-mockup.png
```

The implementation translates that mockup into native XML resources rather than using the mockup image as a runtime asset.

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

Run:

```sh
./gradlew :app:assembleDebug
./gradlew :app:lintDebug
```

Live chat verification requires a reachable Ollama server at `100.116.25.114:11434` with the selected model installed.

## Limits

This is not a production app. It is an experiment/prototype with a hardcoded Ollama base URL, no account system, no backend persistence, no production moderation service, and no claim of being an official AI product.
