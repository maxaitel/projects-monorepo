from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Annotated, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .miso_runtime import MisoRuntime, record_response


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = Path(__file__).resolve().parent / "static"
OUTPUT_DIR = Path(os.environ.get("MISO_OUTPUT_DIR", PROJECT_ROOT / "data" / "outputs"))
UPLOAD_DIR = Path(os.environ.get("MISO_UPLOAD_DIR", PROJECT_ROOT / "data" / "uploads"))
MAX_REFERENCE_SECONDS = float(os.environ.get("MISO_MAX_REFERENCE_SECONDS", "30"))
REQUIRE_CLONE_CONSENT = os.environ.get("MISO_REQUIRE_CLONE_CONSENT", "true").lower() not in {
    "0",
    "false",
    "no",
}

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Miso One WebUI", version="0.1.0")
runtime = MisoRuntime(OUTPUT_DIR, max_reference_seconds=MAX_REFERENCE_SECONDS)
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
    return runtime.status()


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


@app.post("/api/generate")
async def generate(
    text: Annotated[str, Form(min_length=1)],
    speaker: Annotated[int, Form(ge=0, le=99)] = 0,
    max_audio_length_ms: Annotated[int, Form(ge=1000, le=90000)] = 10000,
    temperature: Annotated[float, Form(ge=0.05, le=2.0)] = 0.9,
    topk: Annotated[int, Form(ge=1, le=2048)] = 50,
    reference_text: Annotated[Optional[str], Form()] = None,
    voice_consent: Annotated[bool, Form()] = False,
    reference_audio: Annotated[Optional[UploadFile], File()] = None,
) -> dict:
    reference_path: Path | None = None
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


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=7860, reload=False)


if __name__ == "__main__":
    main()
