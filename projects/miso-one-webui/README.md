# Miso One WebUI

Minimal local Web UI for Miso Labs Miso TTS 8B, also searched as Miso One.

This is a local GPU-oriented tool, not a hosted production service. It wraps the
official MisoTTS Python inference code and exposes the model capabilities that
are available in that repo:

- text-to-speech sample inference
- prompt-audio voice cloning / voice continuation
- YouTube reference-audio clipping for voice cloning
- local Whisper transcription for reference-audio transcripts
- multi-speaker dialogue generation with generated conversation context
- temperature, top-k, max audio length, speaker id, playback, download, and local history

MisoTTS currently supports English only. Voice cloning here means reference
audio conditioning: upload a short sample plus its transcript, then generate a
new continuation in that voice. This project does not train or save permanent
voice models.

## Requirements

- Python 3.10, 3.11, or 3.12
- Python virtualenv/pip support, for example `python3-venv` on Debian/Ubuntu
- `ffmpeg` on `PATH` for YouTube reference clipping
- A high-VRAM CUDA GPU for interactive use
- About 30-40 GB of free disk for first-run Miso downloads, plus ASR model cache on first transcription
- About 24 GB VRAM recommended for bf16/fp16 inference

CPU inference can run but is expected to be slow.

## Setup

```bash
cd projects/miso-one-webui
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e .
```

The dependency on `miso-tts` installs from the upstream GitHub `main` branch
because the upstream project has not published a release package yet. That means
fresh installs depend on GitHub, Hugging Face, and the current upstream repo
state.

## Run

```bash
MISO_DEVICE=cuda uvicorn app.main:app --host 127.0.0.1 --port 7860
```

Open http://127.0.0.1:7860.

The first request that loads the model downloads the MisoTTS weights and related
models into the Hugging Face cache. Later runs reuse that cache.

## Configuration

Environment variables:

- `MISO_DEVICE`: `cuda` or `cpu`; defaults to CUDA when available
- `MISO_DTYPE`: `bfloat16`, `float16`, or `float32`; defaults to `bfloat16` on CUDA and `float32` on CPU
- `MISO_TTS_8B_MODEL`: Hugging Face repo id or local path to the weights; defaults to `MisoLabs/MisoTTS`
- `MISO_ASR_MODEL`: Hugging Face Whisper model used for reference transcription; defaults to `openai/whisper-base.en`
- `MISO_ASR_DEVICE`: `cuda` or `cpu`; defaults to CUDA when available
- `MISO_ASR_DTYPE`: ASR torch dtype; defaults to `float16` on CUDA and `float32` on CPU
- `MISO_TEXT_TOKENIZER_MODEL`: Llama 3.2-compatible tokenizer repo id; defaults to `meta-llama/Llama-3.2-1B`
- `MISO_TEXT_TOKENIZER_FALLBACK`: tokenizer repo tried when the primary is gated or unavailable; defaults to `NousResearch/Llama-3.2-1B`, set to an empty string to disable
- `MISO_OUTPUT_DIR`: output WAV directory; defaults to `data/outputs`
- `MISO_UPLOAD_DIR`: uploaded reference-audio directory; defaults to `data/uploads`
- `MISO_MAX_REFERENCE_SECONDS`: max prompt audio retained from uploads or prepared clips; defaults to `30`
- `MISO_TRANSCRIBE_MAX_SECONDS`: max audio length sent to the ASR model; defaults to `MISO_MAX_REFERENCE_SECONDS`
- `MISO_YOUTUBE_CLIP_MAX_SECONDS`: max YouTube clip duration accepted by the preparation endpoint; defaults to `30`
- `MISO_YOUTUBE_FETCH_TIMEOUT_SECONDS`: timeout for YouTube audio extraction and clipping; defaults to `180`
- `MISO_REQUIRE_CLONE_CONSENT`: require the voice-rights checkbox for reference audio; defaults to `true`

The upstream Miso inference code uses the official Meta Llama 3.2 tokenizer,
which is gated on Hugging Face. This WebUI keeps that as the primary tokenizer
source but can fall back to a public compatible tokenizer mirror so a fresh
local setup does not require Meta repository access for tokenizer files only.

## API

```bash
curl http://127.0.0.1:7860/api/status
```

Generate simple TTS:

```bash
curl -F 'text=Hello from Miso.' \
  -F 'speaker=0' \
  -F 'max_audio_length_ms=10000' \
  http://127.0.0.1:7860/api/generate
```

Generate with prompt-audio conditioning:

```bash
curl -F 'text=This should continue in the reference voice.' \
  -F 'speaker=0' \
  -F 'reference_text=Transcript of the reference audio.' \
  -F 'reference_audio=@prompt.wav' \
  -F 'voice_consent=true' \
  http://127.0.0.1:7860/api/generate
```

Prepare a 10-second YouTube clip for prompt-audio conditioning:

```bash
curl -F 'youtube_url=https://www.youtube.com/watch?v=VIDEO_ID' \
  -F 'start_seconds=30' \
  -F 'duration_seconds=10' \
  http://127.0.0.1:7860/api/youtube-reference
```

The returned `id` can be submitted as `prepared_reference_audio` to
`/api/generate` instead of uploading `reference_audio`. YouTube clipping uses
`yt-dlp` plus local `ffmpeg`, so it depends on YouTube availability and may not
work for private, age-gated, blocked, or cookie-gated videos.

Transcribe a prepared reference clip:

```bash
curl -F 'prepared_reference_audio=CLIP_ID.wav' \
  http://127.0.0.1:7860/api/transcribe-reference
```

The WebUI calls this automatically after preparing a YouTube clip, and also when
an uploaded reference file is selected. The transcript is editable before clone
generation and should be checked for exactness; Miso voice conditioning is
sensitive to transcript errors.

Generated WAV files are written under `data/outputs/`.

## Safety

Only clone or continue voices that you own or have explicit permission to use.
Do not use this tool to impersonate people, create deceptive audio, commit fraud,
or generate harmful content. The upstream model applies generated-audio
watermarking by default.
