from __future__ import annotations

import asyncio
import math
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Annotated, Optional
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .miso_runtime import MisoRuntime, record_response
from .transcription_runtime import TranscriptionRuntime, transcription_response


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = Path(__file__).resolve().parent / "static"
OUTPUT_DIR = Path(os.environ.get("MISO_OUTPUT_DIR", PROJECT_ROOT / "data" / "outputs"))
UPLOAD_DIR = Path(os.environ.get("MISO_UPLOAD_DIR", PROJECT_ROOT / "data" / "uploads"))
MAX_REFERENCE_SECONDS = float(os.environ.get("MISO_MAX_REFERENCE_SECONDS", "30"))
TRANSCRIBE_MAX_SECONDS = float(os.environ.get("MISO_TRANSCRIBE_MAX_SECONDS", str(MAX_REFERENCE_SECONDS)))
MAX_YOUTUBE_CLIP_SECONDS = float(os.environ.get("MISO_YOUTUBE_CLIP_MAX_SECONDS", "30"))
YOUTUBE_FETCH_TIMEOUT_SECONDS = int(os.environ.get("MISO_YOUTUBE_FETCH_TIMEOUT_SECONDS", "180"))
REQUIRE_CLONE_CONSENT = os.environ.get("MISO_REQUIRE_CLONE_CONSENT", "true").lower() not in {
    "0",
    "false",
    "no",
}

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Miso One WebUI", version="0.1.0")
runtime = MisoRuntime(OUTPUT_DIR, max_reference_seconds=MAX_REFERENCE_SECONDS)
transcriber = TranscriptionRuntime(max_audio_seconds=min(MAX_REFERENCE_SECONDS, TRANSCRIBE_MAX_SECONDS))
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class Turn(BaseModel):
    text: str = Field(min_length=1)
    speaker: int = Field(default=0, ge=0, le=99)


class ConversationRequest(BaseModel):
    turns: list[Turn] = Field(min_length=1, max_length=16)
    max_audio_length_ms: int = Field(default=10000, ge=1000, le=90000)
    temperature: float = Field(default=0.9, ge=0.05, le=2.0)
    topk: int = Field(default=50, ge=1, le=2048)


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status")
async def status() -> dict:
    data = runtime.status()
    data["transcription"] = transcriber.status()
    return data


@app.post("/api/load")
async def load_model() -> dict:
    try:
        return await runtime.ensure_loaded()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/history")
async def history() -> list[dict]:
    return runtime.history()


@app.get("/api/audio/{filename}")
async def audio(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    path = OUTPUT_DIR / safe_name
    if not path.exists() or path.suffix.lower() != ".wav":
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(path, media_type="audio/wav", filename=safe_name)


@app.get("/api/reference-audio/{filename}")
async def reference_audio(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    path = UPLOAD_DIR / safe_name
    if not path.exists() or path.suffix.lower() != ".wav":
        raise HTTPException(status_code=404, detail="Reference audio file not found")
    return FileResponse(path, media_type="audio/wav", filename=safe_name)


@app.post("/api/youtube-reference")
async def youtube_reference(
    youtube_url: Annotated[str, Form(min_length=1)],
    start_seconds: Annotated[float, Form(ge=0)] = 0,
    duration_seconds: Annotated[float, Form(ge=1)] = 10,
) -> dict:
    clip_limit = min(MAX_REFERENCE_SECONDS, MAX_YOUTUBE_CLIP_SECONDS)
    if duration_seconds > clip_limit:
        raise HTTPException(
            status_code=400,
            detail=f"YouTube reference clips are limited to {clip_limit:g} seconds.",
        )

    try:
        clip_path = await asyncio.to_thread(
            _prepare_youtube_reference,
            youtube_url,
            start_seconds,
            duration_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "id": clip_path.name,
        "filename": clip_path.name,
        "audio_url": f"/api/reference-audio/{clip_path.name}",
        "start_seconds": start_seconds,
        "duration_seconds": duration_seconds,
    }


@app.post("/api/transcribe-reference")
async def transcribe_reference(
    prepared_reference_audio: Annotated[Optional[str], Form()] = None,
    reference_audio: Annotated[Optional[UploadFile], File()] = None,
) -> dict:
    has_prepared_reference = bool(prepared_reference_audio and prepared_reference_audio.strip())
    has_uploaded_reference = bool(reference_audio and reference_audio.filename)
    if has_prepared_reference and has_uploaded_reference:
        raise HTTPException(
            status_code=400,
            detail="Use either an uploaded reference audio file or a prepared YouTube clip, not both.",
        )
    if has_prepared_reference:
        reference_path = _resolve_prepared_reference(prepared_reference_audio or "")
    elif has_uploaded_reference:
        reference_path = await _save_upload(reference_audio)  # type: ignore[arg-type]
    else:
        raise HTTPException(status_code=400, detail="Upload reference audio or load a YouTube clip first.")

    try:
        result = await transcriber.transcribe(reference_path)
        return transcription_response(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/generate")
async def generate(
    text: Annotated[str, Form(min_length=1)],
    speaker: Annotated[int, Form(ge=0, le=99)] = 0,
    max_audio_length_ms: Annotated[int, Form(ge=1000, le=90000)] = 10000,
    temperature: Annotated[float, Form(ge=0.05, le=2.0)] = 0.9,
    topk: Annotated[int, Form(ge=1, le=2048)] = 50,
    reference_text: Annotated[Optional[str], Form()] = None,
    voice_consent: Annotated[bool, Form()] = False,
    prepared_reference_audio: Annotated[Optional[str], Form()] = None,
    reference_audio: Annotated[Optional[UploadFile], File()] = None,
) -> dict:
    reference_path: Path | None = None
    has_prepared_reference = bool(prepared_reference_audio and prepared_reference_audio.strip())
    has_uploaded_reference = bool(reference_audio and reference_audio.filename)
    if has_prepared_reference and has_uploaded_reference:
        raise HTTPException(
            status_code=400,
            detail="Use either an uploaded reference audio file or a prepared YouTube clip, not both.",
        )

    if has_prepared_reference:
        if REQUIRE_CLONE_CONSENT and not voice_consent:
            raise HTTPException(
                status_code=400,
                detail="Confirm that you have rights to use the reference voice.",
            )
        reference_path = _resolve_prepared_reference(prepared_reference_audio or "")

    if reference_audio and reference_audio.filename:
        if REQUIRE_CLONE_CONSENT and not voice_consent:
            raise HTTPException(
                status_code=400,
                detail="Confirm that you have rights to use the reference voice.",
            )
        reference_path = await _save_upload(reference_audio)

    try:
        record = await runtime.generate(
            text=text,
            speaker=speaker,
            max_audio_length_ms=max_audio_length_ms,
            temperature=temperature,
            topk=topk,
            reference_audio_path=reference_path,
            reference_text=reference_text,
        )
        return record_response(record)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/conversation")
async def conversation(payload: ConversationRequest) -> dict:
    try:
        record = await runtime.generate_conversation(
            turns=[turn.model_dump() for turn in payload.turns],
            max_audio_length_ms=payload.max_audio_length_ms,
            temperature=payload.temperature,
            topk=payload.topk,
        )
        return record_response(record)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


async def _save_upload(upload: UploadFile) -> Path:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in {".wav", ".mp3", ".flac", ".ogg", ".m4a"}:
        suffix = ".wav"
    path = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    with path.open("wb") as handle:
        shutil.copyfileobj(upload.file, handle)
    await upload.close()
    return path


def _resolve_prepared_reference(filename: str) -> Path:
    safe_name = Path(filename).name
    path = UPLOAD_DIR / safe_name
    if not safe_name or not path.exists() or path.suffix.lower() != ".wav":
        raise HTTPException(status_code=400, detail="Prepared reference audio was not found.")
    return path


def _prepare_youtube_reference(youtube_url: str, start_seconds: float, duration_seconds: float) -> Path:
    parsed = urlparse(youtube_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or not _is_youtube_host(parsed.netloc):
        raise ValueError("Enter a valid YouTube video URL.")

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required for YouTube clipping but is not installed.")

    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("yt-dlp is required for YouTube clipping but is not installed.") from exc

    output_path = UPLOAD_DIR / f"{uuid.uuid4().hex}.wav"
    ydl_opts = {
        "format": "bestaudio/best",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url.strip(), download=False)
    except Exception as exc:
        raise RuntimeError(f"yt-dlp could not read this YouTube URL: {exc}") from exc

    if not isinstance(info, dict) or info.get("_type") == "playlist":
        raise ValueError("Enter a single YouTube video URL, not a playlist.")

    stream_url = info.get("url")
    if not stream_url:
        raise RuntimeError("yt-dlp did not return a playable audio stream for this video.")

    headers = info.get("http_headers") or {}
    header_arg = "".join(f"{key}: {value}\r\n" for key, value in headers.items())
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{start_seconds:.3f}",
    ]
    if header_arg:
        command.extend(["-headers", header_arg])
    command.extend(
        [
            "-i",
            stream_url,
            "-t",
            f"{duration_seconds:.3f}",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "24000",
            "-f",
            "wav",
            str(output_path),
        ]
    )

    try:
        result = subprocess.run(
            command,
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=YOUTUBE_FETCH_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        output_path.unlink(missing_ok=True)
        raise RuntimeError("Timed out while preparing the YouTube clip.") from exc

    if result.returncode != 0:
        output_path.unlink(missing_ok=True)
        try:
            return _prepare_youtube_reference_from_fragments(
                info,
                start_seconds=start_seconds,
                duration_seconds=duration_seconds,
                output_path=output_path,
            )
        except RuntimeError as fallback_exc:
            raise RuntimeError(
                "ffmpeg could not crop the YouTube audio: "
                f"{_safe_process_error(result.stderr)}; DASH fragment fallback also failed: {fallback_exc}"
            ) from fallback_exc

    return output_path



def _prepare_youtube_reference_from_fragments(
    info: dict,
    *,
    start_seconds: float,
    duration_seconds: float,
    output_path: Path,
) -> Path:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required for YouTube clipping but is not installed.")

    audio_format = _select_fragmented_audio_format(info)
    fragments = audio_format.get("fragments") or []
    if not fragments:
        raise RuntimeError("yt-dlp did not return downloadable audio fragments for this video.")

    fragment_duration = _estimate_fragment_duration(info, fragments)
    start_index = max(0, int(math.floor(start_seconds / fragment_duration)))
    end_index = min(
        len(fragments),
        int(math.ceil((start_seconds + duration_seconds) / fragment_duration)) + 1,
    )
    if start_index >= end_index:
        raise RuntimeError("Requested clip range is outside the available YouTube audio fragments.")

    headers = audio_format.get("http_headers") or info.get("http_headers") or {}
    local_offset = max(0.0, start_seconds - (start_index * fragment_duration))
    with tempfile.TemporaryDirectory(prefix="miso-youtube-", dir=UPLOAD_DIR) as temp_dir:
        combined_path = Path(temp_dir) / "dash-audio.m4a"
        with combined_path.open("wb") as combined:
            for fragment in fragments[start_index:end_index]:
                fragment_url = fragment.get("url")
                if not fragment_url:
                    continue
                request = Request(fragment_url, headers=headers)
                with urlopen(request, timeout=YOUTUBE_FETCH_TIMEOUT_SECONDS) as response:
                    combined.write(response.read())

        if combined_path.stat().st_size == 0:
            raise RuntimeError("Downloaded YouTube audio fragments were empty.")

        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(combined_path),
            "-ss",
            f"{local_offset:.3f}",
            "-t",
            f"{duration_seconds:.3f}",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "24000",
            "-f",
            "wav",
            str(output_path),
        ]
        result = subprocess.run(
            command,
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=YOUTUBE_FETCH_TIMEOUT_SECONDS,
        )

    if result.returncode != 0:
        output_path.unlink(missing_ok=True)
        raise RuntimeError(_safe_process_error(result.stderr))
    return output_path



def _select_fragmented_audio_format(info: dict) -> dict:
    formats = info.get("formats") or []
    audio_formats = [
        item
        for item in formats
        if item.get("acodec") != "none" and item.get("fragments")
    ]
    if not audio_formats:
        requested = info.get("requested_formats") or []
        audio_formats = [
            item
            for item in requested
            if item.get("acodec") != "none" and item.get("fragments")
        ]
    if not audio_formats:
        raise RuntimeError("yt-dlp did not return fragmented audio formats for this video.")

    for preferred_format_id in ("140", "139"):
        for item in audio_formats:
            if item.get("format_id") == preferred_format_id:
                return item
    return max(audio_formats, key=lambda item: float(item.get("abr") or 0))



def _estimate_fragment_duration(info: dict, fragments: list[dict]) -> float:
    duration = info.get("duration")
    if duration and len(fragments) > 0:
        return max(0.5, float(duration) / len(fragments))

    first_url = str((fragments[0] or {}).get("url") or "")
    match = re.search(r"/dur/(\d+(?:\.\d+)?)", first_url)
    if match:
        return max(0.5, float(match.group(1)))
    return 5.0



def _is_youtube_host(netloc: str) -> bool:
    host = netloc.rsplit("@", 1)[-1].split(":", 1)[0].lower()
    return host in {"youtube.com", "youtu.be", "youtube-nocookie.com"} or host.endswith(
        (".youtube.com", ".youtube-nocookie.com")
    )

def _safe_process_error(stderr: str) -> str:
    lines = [line for line in stderr.strip().splitlines() if line.strip()]
    if not lines:
        return "no error details were returned"
    tail = "\n".join(lines[-4:])
    return re.sub(r"https?://\S+", "[url]", tail)


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=7860, reload=False)


if __name__ == "__main__":
    main()
