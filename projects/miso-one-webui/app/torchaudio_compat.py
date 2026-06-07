from __future__ import annotations

import importlib
import math
import sys
from importlib.machinery import ModuleSpec
from types import ModuleType
from typing import Any


def ensure_torchaudio() -> None:
    """Install a small torchaudio fallback when binary torchaudio is unusable."""
    try:
        torchaudio = importlib.import_module("torchaudio")
        getattr(torchaudio, "functional")
        return
    except Exception:
        for name in list(sys.modules):
            if name == "torchaudio" or name.startswith("torchaudio."):
                sys.modules.pop(name, None)

    torch = importlib.import_module("torch")
    np = importlib.import_module("numpy")
    soundfile = importlib.import_module("soundfile")
    scipy_signal = importlib.import_module("scipy.signal")

    torchaudio = ModuleType("torchaudio")
    functional = ModuleType("torchaudio.functional")
    torchaudio.__spec__ = ModuleSpec("torchaudio", loader=None)
    functional.__spec__ = ModuleSpec("torchaudio.functional", loader=None)

    def load(uri: str, *_args: Any, **_kwargs: Any) -> tuple[Any, int]:
        data, sample_rate = soundfile.read(str(uri), dtype="float32", always_2d=True)
        channels_first = np.ascontiguousarray(data.T)
        return torch.from_numpy(channels_first), int(sample_rate)

    def save(uri: str, src: Any, sample_rate: int, *_args: Any, **_kwargs: Any) -> None:
        tensor = src.detach().cpu()
        if tensor.ndim == 1:
            data = tensor.numpy()
        elif tensor.ndim == 2:
            data = tensor.transpose(0, 1).contiguous().numpy()
        else:
            raise ValueError("save expects a 1D waveform or 2D channels-first tensor")
        soundfile.write(str(uri), data, int(sample_rate))

    def resample(waveform: Any, orig_freq: int, new_freq: int, *_args: Any, **_kwargs: Any) -> Any:
        if int(orig_freq) == int(new_freq):
            return waveform

        original_shape = waveform.shape
        device = waveform.device
        dtype = waveform.dtype
        samples = int(original_shape[-1])
        flat = waveform.detach().cpu().float().reshape(-1, samples)

        divisor = math.gcd(int(orig_freq), int(new_freq))
        up = int(new_freq) // divisor
        down = int(orig_freq) // divisor
        resampled = scipy_signal.resample_poly(flat.numpy(), up, down, axis=-1)

        tensor = torch.from_numpy(np.ascontiguousarray(resampled))
        tensor = tensor.reshape(*original_shape[:-1], tensor.shape[-1])
        return tensor.to(device=device, dtype=dtype)

    functional.resample = resample
    torchaudio.functional = functional
    torchaudio.load = load
    torchaudio.save = save
    torchaudio.__version__ = "compat"

    sys.modules["torchaudio"] = torchaudio
    sys.modules["torchaudio.functional"] = functional
