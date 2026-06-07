from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from wallforge.cli import generate, build_parser, selected_targets


class CliTest(unittest.TestCase):
    def test_custom_target_requires_size(self) -> None:
        with self.assertRaises(ValueError):
            selected_targets("custom", None)

    def test_generate_custom_batch(self) -> None:
        parser = build_parser()
        with tempfile.TemporaryDirectory() as tmp:
            args = parser.parse_args(
                [
                    "--style",
                    "bloom",
                    "--target",
                    "custom",
                    "--size",
                    "160x90",
                    "--count",
                    "2",
                    "--quality",
                    "draft",
                    "--seed",
                    "unit-test",
                    "--out",
                    tmp,
                ]
            )
            outputs = generate(args)

            self.assertEqual(len(outputs), 2)
            for path in outputs:
                self.assertTrue(Path(path).exists())
                with Image.open(path) as image:
                    self.assertEqual(image.size, (160, 90))
                    self.assertEqual(image.mode, "RGB")


if __name__ == "__main__":
    unittest.main()
