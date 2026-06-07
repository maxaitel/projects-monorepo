from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

from .render import STYLES, TARGETS, parse_size, render_wallpaper, stable_seed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="wallforge",
        description="Generate high-resolution procedural wallpapers for Mac and phone.",
    )
    parser.add_argument(
        "--style",
        choices=["all", *STYLES],
        default="all",
        help="Wallpaper style to render. Default: all.",
    )
    parser.add_argument(
        "--target",
        choices=["all", "custom", *TARGETS.keys()],
        default="all",
        help="Output size preset. Default: all.",
    )
    parser.add_argument(
        "--size",
        default=None,
        help="Custom size as WIDTHxHEIGHT. Required with --target custom.",
    )
    parser.add_argument(
        "--seed",
        default="midnight-lab",
        help="Seed text or integer. Same seed, style, target, and index regenerate the same image.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=1,
        help="Number of variations per style/target pair. Default: 1.",
    )
    parser.add_argument(
        "--quality",
        choices=["draft", "balanced", "ultra"],
        default="balanced",
        help="Rendering quality. Output dimensions do not change. Default: balanced.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("wallpapers"),
        help="Output directory. Default: wallpapers.",
    )
    parser.add_argument(
        "--jpg",
        action="store_true",
        help="Write JPEG files instead of PNG. PNG is the default.",
    )
    return parser


def selected_styles(style: str) -> list[str]:
    return list(STYLES) if style == "all" else [style]


def selected_targets(target: str, size: str | None) -> list[tuple[str, int, int]]:
    if target == "all":
        return [(name, preset.width, preset.height) for name, preset in TARGETS.items() if name != "macbook"]
    if target == "custom":
        if not size:
            raise ValueError("--size WIDTHxHEIGHT is required with --target custom")
        width, height = parse_size(size)
        return [("custom", width, height)]
    preset = TARGETS[target]
    return [(preset.name, preset.width, preset.height)]


def output_name(style: str, target: str, seed: str, index: int, extension: str) -> str:
    safe_seed = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in seed.strip())
    safe_seed = safe_seed.strip("-") or "seed"
    suffix = f"{index + 1:02d}" if index else "01"
    return f"wallforge-{style}-{target}-{safe_seed}-{suffix}.{extension}"


def generate(args: argparse.Namespace) -> list[Path]:
    if args.count < 1:
        raise ValueError("--count must be at least 1")

    styles = selected_styles(args.style)
    targets = selected_targets(args.target, args.size)
    args.out.mkdir(parents=True, exist_ok=True)

    extension = "jpg" if args.jpg else "png"
    outputs: list[Path] = []

    for style in styles:
        for target_name, width, height in targets:
            for index in range(args.count):
                derived_seed = stable_seed(f"{args.seed}:{style}:{target_name}:{index}")
                image = render_wallpaper(
                    width=width,
                    height=height,
                    style=style,
                    seed=derived_seed,
                    quality=args.quality,
                    label_seed=args.seed,
                )
                out_path = args.out / output_name(style, target_name, args.seed, index, extension)
                save_kwargs = {"quality": 95, "subsampling": 0} if args.jpg else {}
                if not args.jpg and "pnginfo" in image.info:
                    save_kwargs["pnginfo"] = image.info["pnginfo"]
                image.save(out_path, **save_kwargs)
                outputs.append(out_path)

    return outputs


def print_outputs(paths: Iterable[Path]) -> None:
    for path in paths:
        print(path)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        outputs = generate(args)
    except ValueError as error:
        parser.error(str(error))
    print_outputs(outputs)
    return 0
