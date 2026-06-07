from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass
class TranscriptionResult:
    text: str
    model_source: str
    device: str
    duration_seconds: float
    transcription_ms: int


class TranscriptionRuntime:
    def __init__(self, max_audio_seconds: float = 30.0) -> None:
        self.max_audio_seconds = max_audio_seconds
        self._model: Any | None = None
        self._processor: Any | None = None
        self._device: str | None = None
        self._dtype: Any | None = None
        self._dtype_name: str | None = None
        self._model_source: str | None = None
        self._load_lock = asyncio.Lock()
        self._transcription_lock = asyncio.Lock()

    def status(self) -> dict[str, Any]:
        return {
            "loaded": self._model is not None,
            "model_source": self._model_source,
            "device": self._device,
            "dtype": self._dtype_name,
            "max_audio_seconds": self.max_audio_seconds,
        }

    async def transcribe(self, path: Path) -> TranscriptionResult:
        await self.ensure_loaded()
        async with self._transcription_lock:
            return await asyncio.to_thread(self._transcribe_sync, path)

    async def ensure_loaded(self) -> dict[str, Any]:
        if self._model is not None:
            return self.status()
        async with self._load_lock:
            if self._model is None:
                await asyncio.to_thread(self._load_sync)
        return self.status()

    def _load_sync(self) -> None:
        import torch
        from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

        model_source = os.environ.get("MISO_ASR_MODEL", "openai/whisper-base.en")
        device = os.environ.get("MISO_ASR_DEVICE")
        if not device:
            device = "cuda" if torch.cuda.is_available() else "cpu"

        dtype_name = os.environ.get("MISO_ASR_DTYPE")
        if not dtype_name:
            dtype_name = "float16" if device == "cuda" else "float32"
        try:
            dtype = getattr(torch, dtype_name)
        except AttributeError as exc:
            raise ValueError(f"Unsupported MISO_ASR_DTYPE: {dtype_name}") from exc

        self._processor = AutoProcessor.from_pretrained(model_source)
        self._model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_source,
            torch_dtype=dtype,
            use_safetensors=True,
        ).to(device)
        self._model.eval()
        self._device = device
        self._dtype = dtype
        self._dtype_name = dtype_name
        self._model_source = model_source

    def _transcribe_sync(self, path: Path) -> TranscriptionResult:
        import torch

        assert self._model is not None
        assert self._processor is not None
        assert self._device is not None
        assert self._dtype is not None
        assert self._model_source is not None

        started = time.monotonic()
        audio = _load_audio_16khz(path, max_seconds=self.max_audio_seconds)
        duration_seconds = round(float(audio.size) / 16000, 3)
        if audio.size == 0:
            raise ValueError("Reference audio is empty.")

        inputs = self._processor(
            audio,
            sampling_rate=16000,
            return_tensors="pt",
        )
        input_features = inputs.input_features.to(device=self._device, dtype=self._dtype)
        with torch.inference_mode():
            generated_ids = self._model.generate(
                input_features,
                max_new_tokens=128,
            )
        text = self._processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()
        transcription_ms = int((time.monotonic() - started) * 1000)

        return TranscriptionResult(
            text=text,
            model_source=self._model_source,
            device=self._device,
            duration_seconds=duration_seconds,
            transcription_ms=transcription_ms,
        )


def transcription_response(result: TranscriptionResult) -> dict[str, Any]:
    return asdict(result)


def _load_audio_16khz(path: Path, max_seconds: float) -> np.ndarray:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(path),
            "-t",
            f"{max_seconds:.3f}",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "f32le",
            "pipe:1",
        ]
        result = subprocess.run(
            command,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=max(30, int(max_seconds * 8)),
        )
        if result.returncode != 0:
            raise RuntimeError(_format_ffmpeg_error(result.stderr))
        return np.frombuffer(result.stdout, dtype=np.float32).copy()

    return _load_audio_16khz_soundfile(path, max_seconds=max_seconds)


def _load_audio_16khz_soundfile(path: Path, max_seconds: float) -> np.ndarray:
    import soundfile
    from scipy import signal

    data, sample_rate = soundfile.read(str(path), dtype="float32", always_2d=True)
    mono = data.mean(axis=1)
    max_samples = int(sample_rate * max_seconds)
    mono = mono[:max_samples]
    if sample_rate == 16000:
        return mono.astype(np.float32, copy=False)

    gcd = np.gcd(sample_rate, 16000)
    resampled = signal.resample_poly(mono, 16000 // gcd, sample_rate // gcd)
    return np.asarray(resampled, dtype=np.float32)


def _format_ffmpeg_error(stderr: bytes) -> str:
    text = stderr.decode("utf-8", errors="replace").strip()
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return "ffmpeg could not read the reference audio."
    return "\n".join(lines[-4:])
