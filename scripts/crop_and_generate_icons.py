#!/usr/bin/env python3
"""
Crop transparent padding from source logo and generate square icons for frontend PWA
and mobile launcher. Backs up originals with .bak suffix.

Run from repo root: python scripts/crop_and_generate_icons.py
"""
import os
from pathlib import Path
from PIL import Image
import shutil
import argparse

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "mobile" / "assets" / "brand" / "logo-1024.png"
BACKUP_SUFFIX = ".bak"
FRONTEND_DIR = ROOT / "frontend" / "public"
OUT_FILES = [
    (512, FRONTEND_DIR / "icon-512x512.png"),
    (192, FRONTEND_DIR / "icon-192x192.png"),
    (72, FRONTEND_DIR / "icon-72x72.png"),
]
MOBILE_OUT = ROOT / "mobile" / "assets" / "brand" / "logo-1024.png"


def backup(p: Path):
    if p.exists():
        bak = p.with_suffix(p.suffix + BACKUP_SUFFIX)
        if not bak.exists():
            shutil.copy2(p, bak)
            print(f"Backed up {p} -> {bak}")


def trim_transparent(img: Image.Image) -> Image.Image:
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    # Use alpha channel bbox
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    if bbox:
        return img.crop(bbox)
    return img


def make_square_canvas_and_paste(img: Image.Image, size: int, zoom: float = 1.0) -> Image.Image:
    # Resize preserving aspect ratio then paste on square canvas.
    # zoom >1.0 will scale the content up before centering and cropping (effectively zooming in).
    img_copy = img.copy()
    # compute target size after zooming: make the image slightly larger then we'll center it
    target = int(size * zoom)
    img_copy.thumbnail((target, target), Image.LANCZOS)
    # If the thumbnail is smaller than target (because original smaller), allow upscaling moderately
    if img_copy.width < target or img_copy.height < target:
        img_copy = img_copy.resize((min(target, max(img_copy.width, 1)), min(target, max(img_copy.height, 1))), Image.LANCZOS)

    # Now paste onto square canvas and crop to exactly `size` by centering
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    x = (size - img_copy.width) // 2
    y = (size - img_copy.height) // 2
    # If img_copy is larger than canvas, we will paste with negative offsets to center-crop
    canvas.paste(img_copy, (x, y), img_copy)
    return canvas


def main():
    if not SRC.exists():
        print(f"Source not found: {SRC}")
        return

    # Backup source and frontend files
    backup(SRC)
    for _, out in OUT_FILES:
        backup(out)
    backup(MOBILE_OUT)

    parser = argparse.ArgumentParser(description="Crop logo and generate icons with optional zoom")
    parser.add_argument("--zoom", type=float, default=1.0, help="Zoom factor >1.0 to enlarge logo within the canvas (default 1.0)")
    args = parser.parse_args()

    img = Image.open(SRC).convert("RGBA")
    img = trim_transparent(img)
    print("Trimmed transparent padding.")

    # Save mobile 1024 (centered on square canvas) with zoom applied
    mobile_canvas = make_square_canvas_and_paste(img, 1024, zoom=args.zoom)
    mobile_canvas.save(MOBILE_OUT)
    print(f"Wrote mobile asset: {MOBILE_OUT}")

    # Generate frontend icons
    for size, outpath in OUT_FILES:
        icon = make_square_canvas_and_paste(img, size, zoom=args.zoom)
        outpath.parent.mkdir(parents=True, exist_ok=True)
        icon.save(outpath)
        print(f"Wrote frontend icon: {outpath} (size {size})")

    print("Done. Frontend icons and mobile asset updated.\nPlease run flutter launcher icon generator if you want Android adaptive icons regenerated:")
    print("  Push-Location mobile; flutter pub get; flutter pub run flutter_launcher_icons:main; Pop-Location")


if __name__ == '__main__':
    main()
