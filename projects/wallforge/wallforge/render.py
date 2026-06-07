from __future__ import annotations

from dataclasses import dataclass
import hashlib
import math
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, PngImagePlugin


@dataclass(frozen=True)
class Target:
    name: str
    width: int
    height: int


TARGETS: dict[str, Target] = {
    "mac": Target("mac", 6016, 3384),
    "macbook": Target("macbook", 3456, 2234),
    "phone": Target("phone", 1290, 2796),
}

STYLES = ("vista", "bloom", "wave", "capsule")

QUALITY_MAX_DIM = {
    "draft": 1200,
    "balanced": 2600,
    "ultra": 4200,
}

PALETTES: tuple[tuple[tuple[int, int, int], ...], ...] = (
    ((8, 12, 25), (25, 78, 112), (34, 210, 172), (242, 90, 146), (255, 207, 105)),
    ((6, 10, 22), (47, 40, 92), (83, 196, 255), (255, 122, 89), (255, 232, 166)),
    ((11, 16, 18), (28, 92, 83), (232, 196, 93), (224, 79, 112), (170, 228, 255)),
    ((12, 10, 20), (72, 38, 103), (58, 219, 182), (255, 167, 71), (238, 236, 221)),
)

VISTA_PALETTES: tuple[tuple[tuple[int, int, int], ...], ...] = (
    (
        (44, 67, 117),
        (126, 176, 214),
        (166, 171, 166),
        (219, 161, 96),
        (196, 109, 50),
        (151, 59, 49),
        (43, 29, 55),
    ),
    (
        (38, 75, 122),
        (147, 198, 219),
        (176, 178, 165),
        (228, 176, 103),
        (183, 113, 56),
        (124, 52, 64),
        (38, 30, 65),
    ),
    (
        (51, 68, 112),
        (133, 169, 199),
        (167, 166, 158),
        (207, 153, 92),
        (174, 96, 54),
        (139, 58, 72),
        (47, 28, 50),
    ),
    (
        (31, 57, 102),
        (104, 158, 204),
        (159, 166, 166),
        (218, 171, 111),
        (203, 122, 57),
        (161, 67, 56),
        (48, 32, 59),
    ),
)


def parse_size(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"\s*(\d{2,5})x(\d{2,5})\s*", value.lower())
    if not match:
        raise ValueError("size must look like WIDTHxHEIGHT, for example 3200x1800")
    width, height = int(match.group(1)), int(match.group(2))
    if width < 64 or height < 64:
        raise ValueError("width and height must each be at least 64 pixels")
    return width, height


def stable_seed(value: str | int) -> int:
    if isinstance(value, int):
        return value & 0xFFFFFFFF
    try:
        return int(value) & 0xFFFFFFFF
    except ValueError:
        digest = hashlib.sha256(value.encode("utf-8")).digest()
        return int.from_bytes(digest[:8], "big") & 0xFFFFFFFF


def render_wallpaper(
    width: int,
    height: int,
    style: str,
    seed: int | str,
    quality: str = "balanced",
    label_seed: str | None = None,
) -> Image.Image:
    if style not in STYLES:
        raise ValueError(f"unknown style {style!r}")
    if quality not in QUALITY_MAX_DIM:
        raise ValueError(f"unknown quality {quality!r}")
    if width < 64 or height < 64:
        raise ValueError("width and height must each be at least 64 pixels")

    numeric_seed = stable_seed(seed)
    rng = np.random.default_rng(numeric_seed)
    palette = PALETTES[numeric_seed % len(PALETTES)]
    work_width, work_height = _work_size(width, height, QUALITY_MAX_DIM[quality])

    if style == "vista":
        image = _render_vista(work_width, work_height, rng)
    elif style == "bloom":
        image = _render_bloom(work_width, work_height, rng)
    elif style == "wave":
        image = _render_wave(work_width, work_height, rng)
    elif style == "capsule":
        image = _render_capsule(work_width, work_height, rng)
    else:
        # Kept for old direct imports, but not exposed as CLI styles.
        legacy_palette = palette
        if style == "aurora":
            image = _render_aurora(work_width, work_height, rng, legacy_palette)
        elif style == "topo":
            image = _render_topo(work_width, work_height, rng, legacy_palette)
        else:
            image = _render_ribbon(work_width, work_height, rng, legacy_palette)

    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.LANCZOS)

    image = _add_final_texture(image, numeric_seed, grain=0.35 if style == "vista" else 2.6)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("wallforge_style", style)
    metadata.add_text("wallforge_seed", str(label_seed if label_seed is not None else seed))
    metadata.add_text("wallforge_numeric_seed", str(numeric_seed))
    metadata.add_text("wallforge_quality", quality)
    image.info["pnginfo"] = metadata
    return image


def _work_size(width: int, height: int, max_dim: int) -> tuple[int, int]:
    largest = max(width, height)
    if largest <= max_dim:
        return width, height
    scale = max_dim / largest
    return max(64, round(width * scale)), max(64, round(height * scale))


def _grid(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    aspect = width / height
    x = np.linspace(-aspect, aspect, width, dtype=np.float32)
    y = np.linspace(-1.0, 1.0, height, dtype=np.float32)
    return np.meshgrid(x, y)


def _as_color_array(color: tuple[int, int, int]) -> np.ndarray:
    return np.array(color, dtype=np.float32)


def _ramp(colors: tuple[tuple[int, int, int], ...], t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    scaled = t * (len(colors) - 1)
    idx = np.floor(scaled).astype(np.int16)
    idx = np.clip(idx, 0, len(colors) - 2)
    local = (scaled - idx)[..., None]
    palette = np.array(colors, dtype=np.float32)
    return palette[idx] * (1.0 - local) + palette[idx + 1] * local


def _ramp_stops(stops: tuple[tuple[float, tuple[int, int, int]], ...], t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    result = np.zeros((*t.shape, 3), dtype=np.float32)
    for index, (left_t, left_color) in enumerate(stops[:-1]):
        right_t, right_color = stops[index + 1]
        span = max(right_t - left_t, 1e-6)
        local = np.clip((t - left_t) / span, 0.0, 1.0)[..., None]
        segment = _as_color_array(left_color) * (1.0 - local) + _as_color_array(right_color) * local
        mask = ((t >= left_t) & (t <= right_t))[..., None]
        result = np.where(mask, segment, result)
    result = np.where((t < stops[0][0])[..., None], _as_color_array(stops[0][1]), result)
    result = np.where((t > stops[-1][0])[..., None], _as_color_array(stops[-1][1]), result)
    return result


def _smooth_ramp_stops(stops: tuple[tuple[float, tuple[int, int, int]], ...], t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    result = np.zeros((*t.shape, 3), dtype=np.float32)
    for index, (left_t, left_color) in enumerate(stops[:-1]):
        right_t, right_color = stops[index + 1]
        span = max(right_t - left_t, 1e-6)
        local = np.clip((t - left_t) / span, 0.0, 1.0)
        local = local * local * local * (local * (local * 6.0 - 15.0) + 10.0)
        local = local[..., None]
        segment = _as_color_array(left_color) * (1.0 - local) + _as_color_array(right_color) * local
        mask = ((t >= left_t) & (t <= right_t))[..., None]
        result = np.where(mask, segment, result)
    result = np.where((t < stops[0][0])[..., None], _as_color_array(stops[0][1]), result)
    result = np.where((t > stops[-1][0])[..., None], _as_color_array(stops[-1][1]), result)
    return result


def _to_image(rgb: np.ndarray) -> Image.Image:
    return Image.fromarray(np.rint(np.clip(rgb, 0, 255)).astype(np.uint8), "RGB")


def _to_dithered_image(rgb: np.ndarray, rng: np.random.Generator, amount: float) -> Image.Image:
    height, width, _ = rgb.shape
    luminance_noise = rng.random((height, width, 1), dtype=np.float32)
    luminance_noise -= rng.random((height, width, 1), dtype=np.float32)
    chroma_noise = rng.random((height, width, 3), dtype=np.float32)
    chroma_noise -= rng.random((height, width, 3), dtype=np.float32)
    dithered = rgb + luminance_noise * amount + chroma_noise * amount * 0.18
    return _to_image(dithered)


def _box_blur_axis(values: np.ndarray, radius: int, axis: int) -> np.ndarray:
    if radius < 1:
        return values

    pad_width = [(0, 0)] * values.ndim
    pad_width[axis] = (radius, radius)
    padded = np.pad(values, pad_width, mode="edge")
    zero_shape = list(padded.shape)
    zero_shape[axis] = 1
    cumsum = np.concatenate(
        (np.zeros(zero_shape, dtype=np.float32), np.cumsum(padded, axis=axis, dtype=np.float32)),
        axis=axis,
    )

    window = radius * 2 + 1
    right = [slice(None)] * values.ndim
    left = [slice(None)] * values.ndim
    right[axis] = slice(window, None)
    left[axis] = slice(None, -window)
    return (cumsum[tuple(right)] - cumsum[tuple(left)]) / window


def _soften_float_field(rgb: np.ndarray, radius: int) -> np.ndarray:
    if radius < 1:
        return rgb
    softened = _box_blur_axis(rgb, radius, axis=1)
    softened = _box_blur_axis(softened, max(1, radius // 2), axis=0)
    return softened.astype(np.float32, copy=False)


def _rotated_coordinates(
    x: np.ndarray,
    y: np.ndarray,
    angle: float,
    cx: float = 0.0,
    cy: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    cosine = math.cos(angle)
    sine = math.sin(angle)
    shifted_x = x - cx
    shifted_y = y - cy
    return shifted_x * cosine + shifted_y * sine, -shifted_x * sine + shifted_y * cosine


def _unit_grid(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    x = np.linspace(-1.0, 1.0, width, dtype=np.float32)
    y = np.linspace(-1.0, 1.0, height, dtype=np.float32)
    return np.meshgrid(x, y)


def _gaussian(value: np.ndarray, center: float, sigma: float) -> np.ndarray:
    return np.exp(-((value - center) ** 2) / (2.0 * sigma**2))


def _smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _superellipse(
    x: np.ndarray,
    y: np.ndarray,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    power: float = 4.0,
    softness: float = 0.28,
) -> np.ndarray:
    d = (np.abs((x - cx) / rx) ** power) + (np.abs((y - cy) / ry) ** power)
    return np.exp(-np.maximum(d - 0.62, 0.0) ** 2 / softness)


def _superellipse_distance(
    x: np.ndarray,
    y: np.ndarray,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    power: float,
) -> np.ndarray:
    return ((np.abs((x - cx) / rx) ** power) + (np.abs((y - cy) / ry) ** power)) ** (1.0 / power)


def _blend_toward(rgb: np.ndarray, color_field: np.ndarray, mask: np.ndarray, amount: float = 1.0) -> np.ndarray:
    alpha = np.clip(mask * amount, 0.0, 1.0)[..., None]
    return rgb * (1.0 - alpha) + color_field * alpha


def _add_light(rgb: np.ndarray, color: tuple[int, int, int], mask: np.ndarray, amount: float) -> np.ndarray:
    return rgb + _as_color_array(color) * np.clip(mask * amount, 0.0, 1.0)[..., None]


def _screen(rgb: np.ndarray, color: tuple[int, int, int], mask: np.ndarray, amount: float = 1.0) -> np.ndarray:
    alpha = np.clip(mask * amount, 0.0, 1.0)[..., None]
    layer = _as_color_array(color) * alpha
    return 255.0 - (255.0 - rgb) * (255.0 - layer) / 255.0


def _multiply(rgb: np.ndarray, mask: np.ndarray, amount: float) -> np.ndarray:
    shade = 1.0 - np.clip(mask * amount, 0.0, 1.0)
    return rgb * shade[..., None]


def _reference_base(width: int, height: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    x, y = _unit_grid(width, height)
    rgb = np.zeros((height, width, 3), dtype=np.float32)
    rgb += np.array((2, 3, 8), dtype=np.float32)
    rgb = _screen(rgb, (9, 16, 45), _gaussian(y, -0.10, 0.75), 0.26)
    rgb = _screen(rgb, (32, 12, 42), _gaussian(x, rng.uniform(-0.85, 0.85), 0.85) * _gaussian(y, 0.35, 0.75), 0.18)
    return x, y, rgb


def _add_reference_finish(image: Image.Image, rng: np.random.Generator) -> Image.Image:
    width, height = image.size
    bloom = image.filter(ImageFilter.GaussianBlur(max(10, round(max(width, height) / 64))))
    image = Image.blend(image, bloom, 0.22)

    arr = np.asarray(image).astype(np.float32)
    scan = 1.0 + 0.014 * np.sin(np.linspace(0, math.tau * height * 0.46, height, dtype=np.float32))[:, None, None]
    arr *= scan
    noise = rng.normal(0, 1.35, size=(height, width, 1)).astype(np.float32)
    arr += noise
    luminance = (arr[..., 0:1] * 0.2126) + (arr[..., 1:2] * 0.7152) + (arr[..., 2:3] * 0.0722)
    arr = luminance + (arr - luminance) * 1.28
    knee = 184.0
    arr = np.where(arr > knee, knee + (arr - knee) * 0.42, arr)
    arr = (arr - 88.0) * 1.06 + 88.0
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def _render_vista(width: int, height: int, rng: np.random.Generator) -> Image.Image:
    x, y = _unit_grid(width, height)
    palette = VISTA_PALETTES[int(rng.integers(0, len(VISTA_PALETTES)))]
    top_left, top_right, mist, gold, ember, rose, shadow = palette

    vertical = np.clip((y + 1.0) / 2.0, 0.0, 1.0)
    phase = rng.uniform(0, math.tau)
    horizon = rng.uniform(0.44, 0.54)
    tilt = x * rng.uniform(-0.145, -0.095)
    drift = rng.uniform(0.038, 0.060) * np.sin(x * math.pi * rng.uniform(0.52, 0.78) + phase)
    drift += rng.uniform(0.018, 0.032) * np.sin((x + vertical * 0.65) * math.pi * rng.uniform(0.84, 1.10) + phase * 0.6)
    field_t = np.clip(vertical + tilt + drift, 0.0, 1.0)

    x_mix = np.clip((x + 1.0) / 2.0, 0.0, 1.0)
    top_field = _as_color_array(top_left) * (1.0 - x_mix[..., None]) + _as_color_array(top_right) * x_mix[..., None]
    mist_field = _as_color_array(mist) * 0.82 + _as_color_array(top_right) * 0.18
    gold_field = _as_color_array(gold) * (1.0 - x_mix[..., None] * 0.34) + _as_color_array(mist) * (x_mix[..., None] * 0.18)
    ember_field = _as_color_array(gold) * 0.30 + _as_color_array(ember) * 0.50 + _as_color_array(rose) * 0.20
    rose_field = _as_color_array(ember) * (1.0 - x_mix[..., None] * 0.45) + _as_color_array(rose) * (0.42 + x_mix[..., None] * 0.58)
    shadow_field = _as_color_array(shadow) * 0.86 + _as_color_array(rose) * 0.14

    sky_weight = 0.95 * (1.0 - _smoothstep(0.16, 0.72, field_t))
    mist_weight = 0.82 * _gaussian(field_t, horizon, 0.26)
    gold_weight = 0.88 * _gaussian(field_t, rng.uniform(0.57, 0.64), 0.25)
    ember_weight = 0.70 * _gaussian(field_t, rng.uniform(0.70, 0.77), 0.31)
    rose_weight = 0.54 * _gaussian(field_t, rng.uniform(0.82, 0.89), 0.32)
    shadow_weight = 0.56 * _smoothstep(0.66, 1.08, field_t)

    rgb = (
        top_field * sky_weight[..., None]
        + mist_field * mist_weight[..., None]
        + gold_field * gold_weight[..., None]
        + ember_field * ember_weight[..., None]
        + rose_field * rose_weight[..., None]
        + shadow_field * shadow_weight[..., None]
    )
    total_weight = sky_weight + mist_weight + gold_weight + ember_weight + rose_weight + shadow_weight
    rgb /= np.maximum(total_weight, 1e-6)[..., None]

    glow = _gaussian(field_t, rng.uniform(0.56, 0.64), 0.30)
    glow *= _gaussian(x, rng.uniform(-0.62, -0.18), rng.uniform(0.82, 1.12))
    rgb = _screen(rgb, gold, glow, 0.14)

    cool_corner = _gaussian(field_t, rng.uniform(0.08, 0.18), 0.24) * _gaussian(x, rng.uniform(0.52, 0.92), 0.70)
    rgb = _screen(rgb, top_right, cool_corner, 0.10)

    dome_u, dome_v = _rotated_coordinates(x, y, rng.uniform(-0.20, -0.08), cx=rng.uniform(-0.26, -0.10), cy=rng.uniform(0.38, 0.50))
    dome = np.exp(-((dome_u / 1.05) ** 2 + (dome_v / 0.58) ** 2))
    dome *= _smoothstep(0.34, 0.88, field_t)
    dome_field = _as_color_array(gold) * 0.36 + _as_color_array(ember) * 0.48 + _as_color_array(rose) * 0.16
    rgb = _blend_toward(rgb, np.zeros_like(rgb) + dome_field, dome, 0.30)

    shelf_u, shelf_v = _rotated_coordinates(x, y, rng.uniform(-0.34, -0.22), cx=rng.uniform(0.20, 0.38), cy=rng.uniform(-0.10, 0.02))
    shelf = np.exp(-((shelf_u / 1.18) ** 2 + (shelf_v / 0.42) ** 2))
    shelf *= 1.0 - _smoothstep(0.34, 0.78, field_t)
    shelf_field = _as_color_array(top_left) * 0.38 + _as_color_array(mist) * 0.62
    rgb = _blend_toward(rgb, np.zeros_like(rgb) + shelf_field, shelf, 0.28)

    sweep_angle = rng.uniform(-0.62, -0.48)
    sweep_u, sweep_v = _rotated_coordinates(x, y, sweep_angle, cx=rng.uniform(-0.06, 0.10), cy=rng.uniform(0.08, 0.20))
    sweep_curve = rng.uniform(-0.16, -0.06) + 0.25 * np.tanh((sweep_u + 0.12) * 1.35)
    sweep_curve += 0.045 * np.sin((sweep_u + 0.35) * math.pi * rng.uniform(0.62, 0.86) + phase)
    sweep = _gaussian(sweep_v, sweep_curve, rng.uniform(0.24, 0.31))
    sweep *= 1.0 - _smoothstep(0.86, 1.42, np.abs(sweep_u))
    sweep *= _smoothstep(0.12, 0.82, field_t)
    sweep_field = _as_color_array(gold) * 0.48 + _as_color_array(ember) * 0.39 + _as_color_array(rose) * 0.13
    rgb = _blend_toward(rgb, np.zeros_like(rgb) + sweep_field, sweep, 0.42)

    crest = _gaussian(sweep_v, sweep_curve - 0.26, 0.28)
    crest *= 1.0 - _smoothstep(0.70, 1.34, np.abs(sweep_u + 0.10))
    crest *= 1.0 - _smoothstep(0.48, 0.94, field_t)
    crest_field = _as_color_array(mist) * 0.64 + _as_color_array(top_right) * 0.36
    rgb = _blend_toward(rgb, np.zeros_like(rgb) + crest_field, crest, 0.30)

    upper_cut = 1.0 - _smoothstep(sweep_curve - 0.10, sweep_curve + 0.34, sweep_v)
    upper_cut *= _smoothstep(-1.12, 0.34, sweep_u)
    upper_cut *= 1.0 - _smoothstep(0.30, 0.82, field_t)
    cool_sweep = _as_color_array(top_left) * 0.54 + _as_color_array(mist) * 0.46
    rgb = _blend_toward(rgb, np.zeros_like(rgb) + cool_sweep, upper_cut, 0.24)

    basin_u, basin_v = _rotated_coordinates(x, y, rng.uniform(0.32, 0.52), cx=rng.uniform(0.28, 0.44), cy=rng.uniform(0.66, 0.78))
    basin = np.exp(-((basin_u / 1.06) ** 2 + (basin_v / 0.46) ** 2))
    basin *= _smoothstep(0.52, 0.98, field_t)
    basin_field = _as_color_array(rose) * 0.62 + _as_color_array(shadow) * 0.38
    rgb = _blend_toward(rgb, np.zeros_like(rgb) + basin_field, basin, 0.36)

    lower = _smoothstep(0.56, 1.0, field_t)
    bottom_shadow = _smoothstep(0.78, 1.0, field_t)
    side_shadow = _smoothstep(0.80, 1.0, np.abs(x)) * (0.35 + lower * 0.48)
    rgb = _multiply(rgb, bottom_shadow + side_shadow, 0.22)
    rgb = _vignette(rgb, x, y, 0.12)

    arr = rgb
    luminance = (arr[..., 0:1] * 0.2126) + (arr[..., 1:2] * 0.7152) + (arr[..., 2:3] * 0.0722)
    arr = luminance + (arr - luminance) * 1.03
    arr = (arr - 104.0) * 0.95 + 104.0
    arr = _soften_float_field(arr, max(4, round(max(width, height) / 120)))
    return _to_dithered_image(arr, rng, amount=0.92)


def _render_bloom(width: int, height: int, rng: np.random.Generator) -> Image.Image:
    x, y, rgb = _reference_base(width, height, rng)
    portrait = height >= width
    cx = rng.uniform(-0.04, 0.04)
    cy = rng.uniform(0.10, 0.18) if portrait else rng.uniform(0.15, 0.24)
    rx = rng.uniform(0.92, 1.08) if portrait else rng.uniform(0.78, 0.98)
    ry = rng.uniform(0.88, 1.06) if portrait else rng.uniform(0.74, 0.92)
    distance = _superellipse_distance(x, y, cx, cy, rx, ry, 3.2)
    envelope = 1.0 - _smoothstep(0.56, 1.28, distance)
    core = 1.0 - _smoothstep(0.18, 0.76, distance)
    wobble = 0.045 * np.sin((x - cx) * math.pi * rng.uniform(0.85, 1.18) + rng.uniform(0, math.tau))
    t = np.clip((y + wobble + 1.0) / 2.0, 0.0, 1.0)
    field = _ramp_stops(
        (
            (0.00, (20, 31, 244)),
            (0.18, (35, 113, 255)),
            (0.31, (77, 205, 236)),
            (0.43, (112, 208, 196)),
            (0.51, (245, 172, 42)),
            (0.64, (255, 82, 42)),
            (0.79, (244, 45, 204)),
            (1.00, (126, 31, 222)),
        ),
        t,
    )
    rgb = _blend_toward(rgb, field, envelope, 1.0)
    rgb = _add_light(rgb, (255, 134, 24), core * _gaussian(t, 0.55, 0.17), 0.12)
    rgb = _add_light(rgb, (255, 48, 189), envelope * _gaussian(t, 0.72, 0.22), 0.40)
    rgb = _add_light(rgb, (41, 32, 255), envelope * _gaussian(t, 0.06, 0.22), 0.34)
    side_falloff = _smoothstep(0.68, 1.0, np.abs(x - cx))
    top_falloff = _smoothstep(0.88, 1.0, -y)
    rgb = _multiply(rgb, side_falloff + top_falloff * 0.25, 0.40 if portrait else 0.54)
    return _add_reference_finish(_to_image(rgb), rng)


def _render_wave(width: int, height: int, rng: np.random.Generator) -> Image.Image:
    x, y, rgb = _reference_base(width, height, rng)
    portrait = height >= width
    base_t = np.clip((y + 1.0) / 2.0, 0.0, 1.0)
    base = _ramp_stops(
        (
            (0.00, (11, 6, 38)),
            (0.16, (93, 28, 216)),
            (0.34, (237, 34, 215)),
            (0.56, (255, 47, 192)),
            (0.78, (123, 31, 211)),
            (1.00, (7, 3, 26)),
        ),
        base_t,
    )
    full_mask = 1.0 - _smoothstep(0.92, 1.28, np.sqrt((x * 0.76) ** 2 + (y * 0.90) ** 2))
    rgb = _blend_toward(rgb, base, full_mask, 1.0)

    curve = -0.06 + 0.22 * np.tanh((x - 0.05) * 1.55)
    curve += 0.035 * np.sin((x + 0.24) * math.pi * 1.20)
    ribbon = _gaussian(y, curve, 0.125 if portrait else 0.095)
    ribbon *= _smoothstep(-0.30, 0.08, x) * (1.0 - _smoothstep(0.90, 1.0, x))
    orange_field = np.zeros_like(rgb) + _as_color_array((255, 95, 12))
    orange_field = _blend_toward(orange_field, np.zeros_like(rgb) + _as_color_array((255, 151, 31)), _gaussian(x, 0.42, 0.52), 0.72)
    orange_field = _blend_toward(orange_field, np.zeros_like(rgb) + _as_color_array((255, 49, 195)), _gaussian(y, curve + 0.20, 0.16), 0.32)
    rgb = _blend_toward(rgb, orange_field, ribbon, 1.0)
    rgb = _add_light(rgb, (255, 86, 8), ribbon * _gaussian(x, 0.26, 0.70), 0.72)
    rgb = _add_light(rgb, (255, 41, 218), _gaussian(y, curve + 0.17, 0.22) * full_mask, 0.32)
    rgb = _add_light(rgb, (42, 21, 255), _gaussian(y, curve - 0.13, 0.13) * _gaussian(x, -0.23, 0.35), 0.56)

    bite_center = -0.08
    bite_profile = np.exp(-((y - bite_center) ** 2) / (2.0 * 0.19**2))
    bite_tip = -0.56 + 0.44 * bite_profile
    notch = bite_profile * (1.0 - _smoothstep(bite_tip - 0.08, bite_tip + 0.10, x))
    notch += _gaussian(y, bite_center + 0.04, 0.14) * _gaussian(x, -0.78, 0.24)
    rgb = _multiply(rgb, notch, 1.0)
    rgb = _multiply(rgb, _smoothstep(0.80, 1.0, np.abs(x)) + _smoothstep(0.82, 1.0, np.abs(y)), 0.58)
    return _add_reference_finish(_to_image(rgb), rng)


def _render_capsule(width: int, height: int, rng: np.random.Generator) -> Image.Image:
    x, y, rgb = _reference_base(width, height, rng)
    portrait = height >= width
    cx = rng.uniform(-0.03, 0.03)
    cy = rng.uniform(-0.02, 0.05)
    rx = rng.uniform(0.54, 0.62) if portrait else rng.uniform(0.34, 0.42)
    ry = rng.uniform(0.72, 0.82) if portrait else rng.uniform(0.66, 0.76)
    distance = _superellipse_distance(x, y, cx, cy, rx, ry, 5.2)
    body = 1.0 - _smoothstep(0.72, 1.08, distance)
    halo = 1.0 - _smoothstep(0.86, 1.50, distance)
    rim = np.clip(halo - body * 0.50, 0.0, 1.0)
    t = np.clip((y - (cy - ry)) / (2.0 * ry), 0.0, 1.0)

    field = _ramp_stops(
        (
            (0.00, (0, 0, 18)),
            (0.13, (23, 23, 230)),
            (0.27, (77, 217, 255)),
            (0.40, (90, 213, 220)),
            (0.50, (245, 174, 28)),
            (0.60, (255, 133, 21)),
            (0.72, (68, 195, 255)),
            (0.86, (30, 42, 240)),
            (1.00, (0, 0, 10)),
        ),
        t,
    )
    rgb = _blend_toward(rgb, field, halo, 1.0)
    rgb = _add_light(rgb, (255, 50, 199), rim * _gaussian(t, 0.54, 0.40), 0.62)
    rgb = _add_light(rgb, (51, 22, 255), rim * (_gaussian(t, 0.12, 0.18) + _gaussian(t, 0.86, 0.18)), 0.70)
    rgb = _add_light(rgb, (255, 96, 12), body * _gaussian(t, 0.55, 0.08), 0.46)
    rgb = _multiply(rgb, (1.0 - halo) + _smoothstep(0.90, 1.0, np.abs(y)), 0.92)
    return _add_reference_finish(_to_image(rgb), rng)


def _soft_light(rgb: np.ndarray, color: tuple[int, int, int], mask: np.ndarray, amount: float) -> np.ndarray:
    glow = _as_color_array(color)
    alpha = np.clip(mask * amount, 0.0, 1.0)[..., None]
    screened = 255.0 - (255.0 - rgb) * (255.0 - glow) / 255.0
    return rgb * (1.0 - alpha) + screened * alpha


def _vignette(rgb: np.ndarray, x: np.ndarray, y: np.ndarray, strength: float = 0.55) -> np.ndarray:
    radius = np.sqrt((x / (x.max() or 1.0)) ** 2 + y**2)
    shade = 1.0 - strength * np.clip((radius - 0.18) / 1.05, 0.0, 1.0) ** 1.7
    return rgb * shade[..., None]


def _render_aurora(
    width: int,
    height: int,
    rng: np.random.Generator,
    palette: tuple[tuple[int, int, int], ...],
) -> Image.Image:
    x, y = _grid(width, height)
    xn = x / max(abs(float(x.max())), 1e-6)
    vertical = (y + 1.0) / 2.0
    base = _ramp((palette[0], palette[1], (4, 7, 15)), vertical)

    moon_x = rng.uniform(-0.75, 0.75)
    moon_y = rng.uniform(-0.8, -0.35)
    radial = np.exp(-(((x - moon_x) ** 2) / 0.42 + ((y - moon_y) ** 2) / 0.12))
    rgb = _soft_light(base, palette[-1], radial, 0.42)

    for band_index in range(9):
        color = palette[2 + band_index % (len(palette) - 2)]
        phase = rng.uniform(0, math.tau)
        frequency = rng.uniform(1.1, 2.8)
        wave = (
            rng.uniform(-0.25, 0.35)
            + rng.uniform(0.08, 0.22) * np.sin(xn * frequency + phase)
            + rng.uniform(0.03, 0.10) * np.sin(xn * frequency * 2.2 + phase * 0.7)
        )
        sigma = rng.uniform(0.045, 0.13)
        band = np.exp(-((y - wave) ** 2) / (2.0 * sigma**2))
        shear = 0.55 + 0.45 * np.sin((xn * rng.uniform(2.2, 4.5)) + phase)
        rgb = _soft_light(rgb, color, band * shear, rng.uniform(0.20, 0.48))

    streaks = np.sin((xn * 12.0) + (y * 3.0) + rng.uniform(0, math.tau))
    rgb = _soft_light(rgb, palette[3], np.clip(streaks, 0, 1) ** 8, 0.10)
    rgb = _vignette(rgb, x, y, 0.50)

    image = _to_image(rgb).convert("RGBA")
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    for _ in range(18):
        color = (*palette[int(rng.integers(2, len(palette)))], int(rng.integers(26, 62)))
        y0 = int(height * rng.uniform(0.18, 0.78))
        amp = height * rng.uniform(0.025, 0.11)
        phase = rng.uniform(0, math.tau)
        points = []
        for px in range(-width // 12, width + width // 12, max(8, width // 180)):
            py = y0 + math.sin(px / width * math.tau * rng.uniform(0.8, 1.8) + phase) * amp
            py += math.sin(px / width * math.tau * rng.uniform(2.0, 3.4) + phase * 1.7) * amp * 0.35
            points.append((px, py))
        draw.line(points, fill=color, width=max(2, width // int(rng.integers(120, 260))))

    overlay = overlay.filter(ImageFilter.GaussianBlur(max(2, width // 260)))
    image = Image.alpha_composite(image, overlay)

    horizon = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(horizon, "RGBA")
    ridge = []
    base_y = height * rng.uniform(0.80, 0.90)
    ridge_phase_a = rng.uniform(0, math.tau)
    ridge_phase_b = rng.uniform(0, math.tau)
    for px in range(0, width + max(2, width // 80), max(2, width // 80)):
        py = base_y
        py += math.sin(px / width * math.tau * 1.2 + ridge_phase_a) * height * 0.025
        py += math.sin(px / width * math.tau * 3.8 + ridge_phase_b) * height * 0.014
        ridge.append((px, py))
    draw.polygon([(0, height), *ridge, (width, height)], fill=(2, 5, 10, 185))
    glow_line = [(px, py - height * 0.006) for px, py in ridge]
    draw.line(glow_line, fill=(*palette[2], 55), width=max(1, width // 480))
    horizon = horizon.filter(ImageFilter.GaussianBlur(max(1, width // 2200)))
    image = Image.alpha_composite(image, horizon)

    stars = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(stars, "RGBA")
    star_count = max(65, (width * height) // 25000)
    for _ in range(star_count):
        px = int(rng.integers(0, width))
        py = int(rng.integers(0, max(1, int(height * 0.58))))
        radius = rng.choice([1, 1, 1, 2])
        alpha = int(rng.integers(38, 150))
        color = (235, 245, 255, alpha)
        draw.ellipse((px - radius, py - radius, px + radius, py + radius), fill=color)
    return Image.alpha_composite(image, stars).convert("RGB")


def _render_topo(
    width: int,
    height: int,
    rng: np.random.Generator,
    palette: tuple[tuple[int, int, int], ...],
) -> Image.Image:
    x, y = _grid(width, height)
    field = np.zeros((height, width), dtype=np.float32)
    for _ in range(6):
        cx = rng.uniform(-1.1, 1.1)
        cy = rng.uniform(-0.85, 0.85)
        distance = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        field += rng.uniform(0.45, 1.15) * np.sin(distance * rng.uniform(7.0, 14.0) + rng.uniform(0, math.tau))

    field += 0.65 * np.sin(x * rng.uniform(2.0, 4.5) + y * rng.uniform(-2.0, 2.0))
    field += 0.35 * np.cos((x - y) * rng.uniform(3.0, 7.0))
    norm = (field - field.min()) / (field.max() - field.min() + 1e-6)

    rgb = _ramp((palette[0], palette[1], palette[2], palette[-1]), norm)
    diagonal = 0.5 + 0.5 * np.sin(x * 1.5 - y * 2.1)
    rgb = rgb * (0.82 + diagonal[..., None] * 0.22)

    contour_wave = np.abs(np.sin(field * rng.uniform(5.5, 8.5)))
    lines = np.exp(-(contour_wave**2) / 0.006)
    rgb = rgb * (1.0 - lines[..., None] * 0.62) + _as_color_array(palette[-1]) * lines[..., None] * 0.62

    fine_wave = np.abs(np.sin((field + x * 0.8) * rng.uniform(13.0, 18.0)))
    fine_lines = np.exp(-(fine_wave**2) / 0.0025)
    rgb = _soft_light(rgb, palette[3], fine_lines, 0.18)

    glow = np.exp(-((x - rng.uniform(-0.25, 0.55)) ** 2 + (y - rng.uniform(-0.2, 0.5)) ** 2) / 0.18)
    rgb = _soft_light(rgb, palette[2], glow, 0.26)
    rgb = _vignette(rgb, x, y, 0.42)

    image = _to_image(rgb).convert("RGBA")
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    for i in range(16):
        cx = int(width * rng.uniform(-0.10, 1.10))
        cy = int(height * rng.uniform(-0.05, 1.05))
        rx = int(width * rng.uniform(0.10, 0.42))
        ry = int(height * rng.uniform(0.07, 0.28))
        start = int(rng.integers(0, 360))
        end = start + int(rng.integers(40, 220))
        color = palette[(i + 2) % len(palette)]
        draw.arc(
            (cx - rx, cy - ry, cx + rx, cy + ry),
            start=start,
            end=end,
            fill=(*color, int(rng.integers(70, 150))),
            width=max(2, width // int(rng.integers(220, 520))),
        )
        if rng.random() < 0.35:
            dot_r = max(2, width // 420)
            theta = math.radians(start + rng.uniform(0, max(1, end - start)))
            px = cx + math.cos(theta) * rx
            py = cy + math.sin(theta) * ry
            draw.ellipse((px - dot_r, py - dot_r, px + dot_r, py + dot_r), fill=(*palette[-1], 180))

    overlay = overlay.filter(ImageFilter.GaussianBlur(max(1, width // 1200)))
    return Image.alpha_composite(image, overlay).convert("RGB")


def _render_ribbon(
    width: int,
    height: int,
    rng: np.random.Generator,
    palette: tuple[tuple[int, int, int], ...],
) -> Image.Image:
    x, y = _grid(width, height)
    base_t = 0.5 + 0.5 * np.sin(x * 0.9 - y * 1.3 + rng.uniform(0, math.tau))
    rgb = _ramp((palette[0], palette[1], (3, 8, 15), palette[0]), base_t)

    for i in range(9):
        angle = rng.uniform(-1.2, 1.2)
        u = x * math.cos(angle) + y * math.sin(angle)
        v = -x * math.sin(angle) + y * math.cos(angle)
        phase = rng.uniform(0, math.tau)
        center = rng.uniform(-0.95, 0.95) + rng.uniform(0.05, 0.22) * np.sin(u * rng.uniform(2.0, 5.0) + phase)
        sigma = rng.uniform(0.026, 0.090)
        band = np.exp(-((v - center) ** 2) / (2.0 * sigma**2))
        color = palette[(i + 2) % len(palette)]
        rgb = _soft_light(rgb, color, band, rng.uniform(0.24, 0.58))

        edge = np.exp(-((np.abs(v - center) - sigma * 1.55) ** 2) / (2.0 * (sigma * 0.13) ** 2))
        rgb = _soft_light(rgb, palette[-1], edge, rng.uniform(0.16, 0.32))

    caustic = np.abs(np.sin((x * rng.uniform(6, 10)) + np.sin(y * 4.0) * 1.8))
    caustic = np.exp(-(caustic**2) / 0.01)
    rgb = _soft_light(rgb, palette[2], caustic, 0.12)
    rgb = _vignette(rgb, x, y, 0.48)

    image = _to_image(rgb).convert("RGBA")
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    for _ in range(10):
        cx = rng.uniform(0.0, 1.0) * width
        cy = rng.uniform(0.0, 1.0) * height
        radius = rng.uniform(0.10, 0.32) * max(width, height)
        sides = int(rng.integers(3, 6))
        angle = rng.uniform(0, math.tau)
        points = []
        for i in range(sides):
            turn = angle + math.tau * i / sides + rng.uniform(-0.18, 0.18)
            points.append((cx + math.cos(turn) * radius, cy + math.sin(turn) * radius))
        color = palette[int(rng.integers(1, len(palette)))]
        draw.polygon(points, fill=(*color, int(rng.integers(8, 22))))
        draw.line([*points, points[0]], fill=(*palette[-1], int(rng.integers(18, 42))), width=max(1, width // 880))

    for _ in range(14):
        points = []
        anchor_x = rng.uniform(-0.1, 1.1) * width
        anchor_y = rng.uniform(-0.1, 1.1) * height
        span = rng.uniform(0.15, 0.45) * max(width, height)
        angle = rng.uniform(0, math.tau)
        for turn in range(3):
            radius = span * (0.4 + turn * 0.25)
            points.append(
                (
                    anchor_x + math.cos(angle + turn * 2.1) * radius,
                    anchor_y + math.sin(angle + turn * 2.1) * radius,
                )
            )
        color = palette[int(rng.integers(1, len(palette)))]
        draw.line(points, fill=(*color, int(rng.integers(20, 54))), width=max(1, width // 760), joint="curve")

    overlay = overlay.filter(ImageFilter.GaussianBlur(max(1, width // 1800)))
    return Image.alpha_composite(image, overlay).convert("RGB")


def _add_final_texture(image: Image.Image, seed: int, grain: float) -> Image.Image:
    rng = np.random.default_rng(seed ^ 0xA53A9D1B)
    arr = np.asarray(image.convert("RGB")).astype(np.float32)
    height, width, _ = arr.shape
    noise = rng.normal(0, grain, size=(height, width, 1)).astype(np.float32)
    arr = np.rint(np.clip(arr + noise, 0, 255)).astype(np.uint8)
    return Image.fromarray(arr, "RGB")
