# Miso One WebUI

Minimal local Web UI for Miso Labs Miso TTS 8B, also searched as Miso One.

This is a local GPU-oriented tool, not a hosted production service. It wraps the
official MisoTTS Python inference code and exposes the model capabilities that
are available in that repo:

- text-to-speech sample inference
- prompt-audio voice cloning / voice continuation
- multi-speaker dialogue generation with generated conversation context
- temperature, top-k, max audio length, speaker id, playback, download, and local history

MisoTTS currently supports English only. Voice cloning here means reference
audio conditioning: upload a short sample plus its transcript, then generate a
new continuation in that voice. This project does not train or save permanent
voice models.

## Requirements

- Python 3.10, 3.11, or 3.12
- Python virtualenv/pip support, for example `python3-venv` on Debian/Ubuntu
- A high-VRAM CUDA GPU for interactive use
- About 30-40 GB of free disk for first-run Hugging Face downloads
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
- `MISO_OUTPUT_DIR`: output WAV directory; defaults to `data/outputs`
- `MISO_UPLOAD_DIR`: uploaded reference-audio directory; defaults to `data/uploads`
- `MISO_MAX_REFERENCE_SECONDS`: max prompt audio retained from uploads; defaults to `30`
- `MISO_REQUIRE_CLONE_CONSENT`: require the voice-rights checkbox for reference audio; defaults to `true`

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

Generated WAV files are written under `data/outputs/`.

## Safety

Only clone or continue voices that you own or have explicit permission to use.
Do not use this tool to impersonate people, create deceptive audio, commit fraud,
or generate harmful content. The upstream model applies generated-audio
watermarking by default.
