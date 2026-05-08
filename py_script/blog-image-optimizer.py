#!/usr/bin/env python3
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Iterable

if TYPE_CHECKING:
    from PIL import Image

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff"}
DEFAULT_SOURCE_DIR = Path("public/doc-covers")
DEFAULT_QUALITY = 80


def require_pillow():
    try:
        from PIL import Image
    except ModuleNotFoundError:
        print(
            "Pillow is required to run this optimizer. Install it with:\n"
            "python3 -m pip install Pillow",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return Image

def format_filesize(num_bytes: int) -> str:
    return f"{num_bytes / 1024:.1f}KB"

def _prepare_image(image: "Image.Image") -> "Image.Image":
    if getattr(image, "is_animated", False):
        try:
            image.seek(0)
        except EOFError:
            pass
    if image.mode == "P":
        image = image.convert("RGBA")
    elif image.mode == "CMYK":
        image = image.convert("RGB")
    return image

def _iter_images(source_dir: Path) -> Iterable[Path]:
    return (
        path
        for path in source_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )

def convert_to_webp_and_delete_original(image_path: Path, destination_root: Path, quality: int) -> None:
    Image = require_pillow()
    rel_dir = image_path.parent.relative_to(DEFAULT_SOURCE_DIR)
    target_dir = destination_root / rel_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    webp_path = target_dir / f"{image_path.stem}.webp"
    original_size = image_path.stat().st_size
    with Image.open(image_path) as img:
        img.load()
        prepared = _prepare_image(img)
        out = prepared.copy()
        if out.mode not in {"RGB", "RGBA"}:
            out = out.convert("RGB")
        out.save(webp_path, "WEBP", quality=quality, method=6)
    webp_size = webp_path.stat().st_size
    image_path.unlink(missing_ok=True)
    print(f"{image_path.name:35} {format_filesize(original_size):>10} {format_filesize(webp_size):>10} {(1 - (webp_size / original_size)) * 100:>8.1f}%")

def optimize_blog_images(source_dir: Path = DEFAULT_SOURCE_DIR, quality: int = DEFAULT_QUALITY) -> None:
    require_pillow()
    source_dir = Path(source_dir)
    if not source_dir.exists():
        print(f"Source directory '{source_dir}' not found.")
        return
    destination_root = source_dir
    files = sorted(_iter_images(source_dir))
    if not files:
        print("No supported images found.")
        return
    print(f"Converting to WebP and deleting originals from '{source_dir}'")
    print("-" * 76)
    print(f"{'Image':35} {'Original':>10} {'WebP':>10} {'Saved%':>9}")
    print("-" * 76)
    for image_path in files:
        if image_path.suffix.lower() == ".webp":
            continue
        convert_to_webp_and_delete_original(image_path, destination_root, quality)
    print("-" * 76)
    print("Conversion finished.")

if __name__ == "__main__":
    optimize_blog_images()
