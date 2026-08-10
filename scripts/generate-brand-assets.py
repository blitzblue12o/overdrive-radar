"""Rasterize Overdrive Radar brand assets from the high-fidelity mark."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
PUBLIC_BRAND = ROOT / "public" / "brand"
ASSETS_SRC = Path(
    r"C:\Users\acamp\.cursor\projects\c-dev-overdrive-radar\assets\overdrive-radar-icon-1024.png"
)

NAVY = (11, 20, 36, 255)
RING = (74, 111, 154, 220)
ACCENT = (94, 182, 255, 255)


def rounded_mask(size: int, radius: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def crop_generated_source() -> Image.Image:
    src = Image.open(ASSETS_SRC).convert("RGBA")
    arr = src.load()
    w, h = src.size
    left, top, right, bottom = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = arr[x, y]
            if a > 10 and not (r > 245 and g > 245 and b > 245):
                left = min(left, x)
                top = min(top, y)
                right = max(right, x)
                bottom = max(bottom, y)
    cropped = src.crop((left, top, right + 1, bottom + 1))
    side = max(cropped.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(
        cropped,
        ((side - cropped.size[0]) // 2, (side - cropped.size[1]) // 2),
        cropped,
    )
    return canvas


def draw_simple_icon(size: int) -> Image.Image:
    """Geometry optimized for 16–32px favicons (readable wedge + blip)."""
    scale = size / 32
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")
    radius = 8 * scale
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=NAVY)

    cx = cy = size / 2
    for r, w in ((10.5 * scale, max(1, round(1.25 * scale))), (6 * scale, max(1, round(scale)))):
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=RING, width=w)

    outer = 11.5 * scale
    bbox = (cx - outer, cy - outer, cx + outer, cy + outer)
    sweep = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(sweep, "RGBA").pieslice(
        bbox, start=270, end=330, fill=(94, 182, 255, 120)
    )
    img = Image.alpha_composite(img, sweep)
    draw = ImageDraw.Draw(img, "RGBA")

    end_x = cx + math.cos(math.radians(330)) * (outer * 0.92)
    end_y = cy + math.sin(math.radians(330)) * (outer * 0.92)
    draw.line((cx, cy, end_x, end_y), fill=ACCENT, width=max(1, round(1.5 * scale)))
    blip = max(2, round(2.25 * scale))
    draw.ellipse((cx - blip, cy - blip, cx + blip, cy + blip), fill=ACCENT)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, mask=rounded_mask(size, radius))
    return out


def resize_mark(mark: Image.Image, size: int) -> Image.Image:
    return mark.resize((size, size), Image.Resampling.LANCZOS)


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({img.size[0]}x{img.size[1]})")


def main() -> None:
    PUBLIC_BRAND.mkdir(parents=True, exist_ok=True)
    mark = crop_generated_source()
    hi = resize_mark(mark, 1024)
    save_png(hi, PUBLIC_BRAND / "overdrive-radar-icon-1024.png")

    # Tiny favicons: simplified geometry (sheet guidance)
    for size, name in [(16, "icon-16.png"), (32, "icon-32.png")]:
        save_png(draw_simple_icon(size), PUBLIC_BRAND / name)

    # App / PWA sizes from high-fidelity mark
    for size, name in [
        (48, "icon-48.png"),
        (180, "apple-touch-icon.png"),
        (192, "icon-192.png"),
        (512, "icon-512.png"),
    ]:
        save_png(resize_mark(mark, size), PUBLIC_BRAND / name)

    save_png(resize_mark(mark, 180), APP / "apple-icon.png")
    # Multi-size ICO — save largest first; append smaller frames.
    ico_images = [
        resize_mark(mark, 48),
        draw_simple_icon(32),
        draw_simple_icon(16),
    ]
    APP.mkdir(parents=True, exist_ok=True)
    ico_path = APP / "favicon.ico"
    ico_images[0].save(ico_path, format="ICO", append_images=ico_images[1:])
    print(f"wrote app/favicon.ico ({ico_path.stat().st_size} bytes)")

    # Open Graph
    og = Image.new("RGBA", (1200, 630), NAVY)
    mark420 = resize_mark(mark, 420)
    og.paste(mark420, ((1200 - 420) // 2, (630 - 420) // 2), mark420)
    save_png(og, APP / "opengraph-image.png")
    save_png(og, PUBLIC_BRAND / "og-default.png")


if __name__ == "__main__":
    main()
