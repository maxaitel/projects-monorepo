from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .torchaudio_compat import ensure_torchaudio


@dataclass
class OutputRecord:
    id: str
    mode: str
    text: str
    speaker: int | None
    filename: str
    sample_rate: int
    duration_seconds: float
    generation_ms: int
    used_reference: bool
    settings: dict[str, Any]
    created_at: float


class MisoRuntime:
    def __init__(self, output_dir: Path, max_reference_seconds: float = 30.0) -> None:
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.max_reference_seconds = max_reference_seconds
        self._generator: Any | None = None
        self._device: str | None = None
        self._dtype: str | None = None
        self._model_source: str | None = None
        self._text_tokenizer_source: str | None = None
        self._load_lock = asyncio.Lock()
        self._generation_lock = asyncio.Lock()
        self._history: list[OutputRecord] = []
        self._history_path = self.output_dir / "history.json"
        self._load_history()

    def status(self) -> dict[str, Any]:
        return {
            "loaded": self._generator is not None,
            "device": self._device,
            "dtype": self._dtype,
            "model_source": self._model_source,
            "text_tokenizer_source": self._text_tokenizer_source,
            "sample_rate": getattr(self._generator, "sample_rate", None),
            "capabilities": [
                "text_to_speech",
                "prompt_audio_voice_cloning",
                "conversation_context",
                "multi_speaker_dialogue",
            ],
        }

    async def ensure_loaded(self) -> dict[str, Any]:
        if self._generator is not None:
            return self.status()
        async with self._load_lock:
            if self._generator is None:
                await asyncio.to_thread(self._load_sync)
        return self.status()

    async def generate(
        self,
        *,
        text: str,
        speaker: int,
        max_audio_length_ms: int,
        temperature: float,
        topk: int,
        reference_audio_path: Path | None = None,
        reference_text: str | None = None,
    ) -> OutputRecord:
        await self.ensure_loaded()
        async with self._generation_lock:
            return await asyncio.to_thread(
                self._generate_sync,
                text,
                speaker,
                max_audio_length_ms,
                temperature,
                topk,
                reference_audio_path,
                reference_text,
            )

    async def generate_conversation(
        self,
        *,
        turns: list[dict[str, Any]],
        max_audio_length_ms: int,
        temperature: float,
        topk: int,
    ) -> OutputRecord:
        await self.ensure_loaded()
        async with self._generation_lock:
            return await asyncio.to_thread(
                self._generate_conversation_sync,
                turns,
                max_audio_length_ms,
                temperature,
                topk,
            )

    def history(self) -> list[dict[str, Any]]:
        return [self._record_to_response(record) for record in self._history]

    def _load_sync(self) -> None:
        os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "60")
        os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "60")
        os.environ.setdefault("NO_TORCH_COMPILE", "1")

        ensure_torchaudio()

        import generator as miso_generator
        import torch

        self._patch_text_tokenizer_loader(miso_generator)

        device = os.environ.get("MISO_DEVICE")
        if not device:
            device = "cuda" if torch.cuda.is_available() else "cpu"

        dtype_name = os.environ.get("MISO_DTYPE")
        if not dtype_name:
            dtype_name = "bfloat16" if device == "cuda" else "float32"
        try:
            dtype = getattr(torch, dtype_name)
        except AttributeError as exc:
            raise ValueError(f"Unsupported MISO_DTYPE: {dtype_name}") from exc

        model_source = os.environ.get("MISO_TTS_8B_MODEL", miso_generator.DEFAULT_MISO_TTS_REPO_ID)
        self._generator = miso_generator.load_miso_8b(
            device=device,
            model_path_or_repo_id=model_source,
            dtype=dtype,
        )
        self._device = device
        self._dtype = dtype_name
        self._model_source = model_source

    def _patch_text_tokenizer_loader(self, miso_generator: Any) -> None:
        primary = os.environ.get("MISO_TEXT_TOKENIZER_MODEL", "meta-llama/Llama-3.2-1B")
        fallback = os.environ.get("MISO_TEXT_TOKENIZER_FALLBACK", "NousResearch/Llama-3.2-1B")
        tokenizer_sources = [primary]
        if fallback and fallback not in tokenizer_sources:
            tokenizer_sources.append(fallback)

        def load_llama3_tokenizer() -> Any:
            from tokenizers.processors import TemplateProcessing
            from transformers import AutoTokenizer

            errors: list[str] = []
            for tokenizer_name in tokenizer_sources:
                try:
                    tokenizer = AutoTokenizer.from_pretrained(tokenizer_name)
                except Exception as exc:
                    errors.append(f"{tokenizer_name}: {exc}")
                    continue

                bos = tokenizer.bos_token
                eos = tokenizer.eos_token
                tokenizer._tokenizer.post_processor = TemplateProcessing(
                    single=f"{bos}:0 $A:0 {eos}:0",
                    pair=f"{bos}:0 $A:0 {eos}:0 {bos}:1 $B:1 {eos}:1",
                    special_tokens=[
                        (f"{bos}", tokenizer.bos_token_id),
                        (f"{eos}", tokenizer.eos_token_id),
                    ],
                )
                self._text_tokenizer_source = tokenizer_name
                return tokenizer

            raise RuntimeError(
                "Failed to load a Llama 3.2 compatible tokenizer. Tried: "
                + "; ".join(errors)
            )

        miso_generator.load_llama3_tokenizer = load_llama3_tokenizer

    def _generate_sync(
        self,
        text: str,
        speaker: int,
        max_audio_length_ms: int,
        temperature: float,
        topk: int,
        reference_audio_path: Path | None,
        reference_text: str | None,
    ) -> OutputRecord:
        ensure_torchaudio()

        import torchaudio
        from generator import Segment

        assert self._generator is not None
        context: list[Any] = []
        used_reference = False

        if reference_audio_path is not None:
            if not reference_text or not reference_text.strip():
                raise ValueError("reference_text is required when reference_audio is supplied")
            prompt_audio = self._load_reference_audio(reference_audio_path)
            context.append(
                Segment(
                    speaker=speaker,
                    text=reference_text.strip(),
                    audio=prompt_audio,
                )
            )
            used_reference = True

        started = time.monotonic()
        audio = self._generator.generate(
            text=text.strip(),
            speaker=speaker,
            context=context,
            max_audio_length_ms=max_audio_length_ms,
            temperature=temperature,
            topk=topk,
        )
        generation_ms = int((time.monotonic() - started) * 1000)

        output_id = uuid.uuid4().hex
        filename = f"{output_id}.wav"
        output_path = self.output_dir / filename
        torchaudio.save(
            str(output_path),
            audio.detach().unsqueeze(0).cpu(),
            self._generator.sample_rate,
        )

        record = OutputRecord(
            id=output_id,
            mode="single",
            text=text.strip(),
            speaker=speaker,
            filename=filename,
            sample_rate=self._generator.sample_rate,
            duration_seconds=round(float(audio.numel()) / self._generator.sample_rate, 3),
            generation_ms=generation_ms,
            used_reference=used_reference,
            settings={
                "max_audio_length_ms": max_audio_length_ms,
                "temperature": temperature,
                "topk": topk,
            },
            created_at=time.time(),
        )
        self._append_history(record)
        return record

    def _generate_conversation_sync(
        self,
        turns: list[dict[str, Any]],
        max_audio_length_ms: int,
        temperature: float,
        topk: int,
    ) -> OutputRecord:
        ensure_torchaudio()

        import torch
        import torchaudio
        from generator import Segment

        assert self._generator is not None
        context: list[Any] = []
        pieces: list[Any] = []

        started = time.monotonic()
        for turn in turns:
            text = str(turn["text"]).strip()
            speaker = int(turn.get("speaker", 0))
            audio = self._generator.generate(
                text=text,
                speaker=speaker,
                context=context,
                max_audio_length_ms=max_audio_length_ms,
                temperature=temperature,
                topk=topk,
            )
            context.append(Segment(speaker=speaker, text=text, audio=audio))
            pieces.append(audio)

        full_audio = torch.cat(pieces, dim=0)
        generation_ms = int((time.monotonic() - started) * 1000)
        output_id = uuid.uuid4().hex
        filename = f"{output_id}.wav"
        output_path = self.output_dir / filename
        torchaudio.save(
            str(output_path),
            full_audio.detach().unsqueeze(0).cpu(),
            self._generator.sample_rate,
        )

        record = OutputRecord(
            id=output_id,
            mode="conversation",
            text="\n".join(f"[{turn.get('speaker', 0)}] {turn['text']}" for turn in turns),
            speaker=None,
            filename=filename,
            sample_rate=self._generator.sample_rate,
            duration_seconds=round(float(full_audio.numel()) / self._generator.sample_rate, 3),
            generation_ms=generation_ms,
            used_reference=False,
            settings={
                "turns": len(turns),
                "max_audio_length_ms": max_audio_length_ms,
                "temperature": temperature,
                "topk": topk,
            },
            created_at=time.time(),
        )
        self._append_history(record)
        return record

    def _load_reference_audio(self, path: Path) -> Any:
        ensure_torchaudio()

        import torchaudio

        assert self._generator is not None
        audio, sample_rate = torchaudio.load(str(path))
        if audio.ndim == 2:
            audio = audio.mean(dim=0)
        else:
            audio = audio.squeeze()
        if sample_rate != self._generator.sample_rate:
            audio = torchaudio.functional.resample(
                audio,
                orig_freq=sample_rate,
                new_freq=self._generator.sample_rate,
            )
        max_samples = int(self._generator.sample_rate * self.max_reference_seconds)
        if audio.numel() > max_samples:
            audio = audio[:max_samples]
        return audio

    def _append_history(self, record: OutputRecord) -> None:
        self._history.insert(0, record)
        self._history = self._history[:50]
        self._save_history()

    def _record_to_response(self, record: OutputRecord) -> dict[str, Any]:
        data = asdict(record)
        data["audio_url"] = f"/api/audio/{record.filename}"
        return data

    def _load_history(self) -> None:
        if not self._history_path.exists():
            return
        try:
            raw = json.loads(self._history_path.read_text())
            self._history = [OutputRecord(**item) for item in raw]
        except Exception:
            self._history = []

    def _save_history(self) -> None:
        payload = [asdict(record) for record in self._history]
        self._history_path.write_text(json.dumps(payload, indent=2))


def record_response(record: OutputRecord) -> dict[str, Any]:
    data = asdict(record)
    data["audio_url"] = f"/api/audio/{record.filename}"
    return data
