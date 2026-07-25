"""Build lightweight WebP copies of runtime images while preserving PNG sources."""

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def optimize(path: Path, max_size: tuple[int, int], quality: int) -> None:
    output = path.with_suffix(".webp")
    with Image.open(path) as source:
        image = source.convert("RGBA" if source.mode in {"RGBA", "LA"} else "RGB")
        image.thumbnail(max_size, Image.Resampling.LANCZOS)
        image.save(output, "WEBP", quality=quality, method=6, exact=True)
    before = path.stat().st_size
    after = output.stat().st_size
    print(f"{path.relative_to(ROOT)}: {before / 1024:.0f}KB -> {after / 1024:.0f}KB")


for image_path in (ROOT / "src/assets/backgrounds").glob("*.png"):
    optimize(image_path, (1920, 1080), 84 if image_path.name != "tt_002.png" else 90)

for image_path in (ROOT / "src/assets/sprites/skills").glob("*.png"):
    optimize(image_path, (512, 768), 82)

for image_path in (ROOT / "src/assets/sprites").glob("*.png"):
    optimize(image_path, (720, 720), 85)

for image_path in (ROOT / "src/assets/sprites/token").glob("*.png"):
    optimize(image_path, (900, 900), 85)
