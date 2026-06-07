from __future__ import annotations

import unittest

import numpy as np

from wallforge.render import STYLES, parse_size, render_wallpaper, stable_seed


class RenderTest(unittest.TestCase):
    def test_parse_size(self) -> None:
        self.assertEqual(parse_size("320x180"), (320, 180))

    def test_seed_is_stable(self) -> None:
        self.assertEqual(stable_seed("midnight-lab"), stable_seed("midnight-lab"))
        self.assertNotEqual(stable_seed("midnight-lab"), stable_seed("solar-drift"))

    def test_all_styles_render_requested_size(self) -> None:
        for style in STYLES:
            with self.subTest(style=style):
                image = render_wallpaper(128, 96, style=style, seed=f"test-{style}", quality="draft")
                self.assertEqual(image.size, (128, 96))
                self.assertEqual(image.mode, "RGB")

    def test_vista_has_cool_top_and_warm_lower_band(self) -> None:
        image = render_wallpaper(240, 135, style="vista", seed="desktop-reference", quality="draft")
        pixels = np.asarray(image).astype(np.float32)

        top = pixels[:28].mean(axis=(0, 1))
        lower = pixels[-36:].mean(axis=(0, 1))

        self.assertGreater(top[2], top[0])
        self.assertGreater(lower[0], lower[2])

    def test_vista_keeps_row_transitions_smooth(self) -> None:
        image = render_wallpaper(640, 360, style="vista", seed="desktop-reference", quality="draft")
        pixels = np.asarray(image).astype(np.float32)
        row_means = pixels.mean(axis=1)
        row_delta = np.abs(np.diff(row_means, axis=0))

        self.assertLess(float(np.percentile(row_delta, 95)), 2.0)

    def test_vista_has_asymmetric_soft_shape(self) -> None:
        image = render_wallpaper(640, 360, style="vista", seed="desktop-reference", quality="draft")
        pixels = np.asarray(image).astype(np.float32)
        mid_lower = pixels[122:266]
        left = mid_lower[:, :160].mean(axis=(0, 1))
        right = mid_lower[:, -160:].mean(axis=(0, 1))

        self.assertGreater(float(np.abs(left - right).mean()), 8.0)


if __name__ == "__main__":
    unittest.main()
