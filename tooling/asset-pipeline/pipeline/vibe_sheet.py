"""Compose the owner-facing Phase 11 vibe sheets from rendered kit frames.

    python3 -m pipeline.vibe_sheet            # all sheets + the contrast sheet
    python3 -m pipeline.vibe_sheet --only gideon,00-contrast

Frames themselves come from `pipeline.render_sheet` (Blender studio renders,
512 px, 1.8 m red scale bar). This module only lays them out with captions, so
re-running it is cheap; re-render the frames first if a kit was rebuilt.

Spec: `pipeline/config/vibe-sheets.json`. Amber captions mark stand-ins.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parents[3]
SPEC = json.loads((Path(__file__).parent / "config" / "vibe-sheets.json").read_text())

TILE = 512
BG = (24, 24, 28)
TEXT = (232, 232, 232)
SUB = (168, 168, 168)
AMBER = (232, 163, 61)
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, width: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=fnt) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines[:2]


def _load(frame_dir: Path, rel: str) -> Image.Image:
    p = frame_dir / rel
    if not p.exists():
        raise SystemExit(f"missing frame {p} — render it with pipeline.render_sheet")
    return Image.open(p).convert("RGB")


def build_sheet(sheet: dict, frame_dir: Path, out_dir: Path) -> Path:
    cols, band, header = 3, 54, 110
    rows = (len(sheet["frames"]) + cols - 1) // cols
    w, h = cols * TILE, header + rows * (TILE + band)
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)
    d.text((14, 12), sheet["title"], font=font(30), fill=TEXT)
    d.text((14, 54), sheet["subtitle"], font=font(19), fill=SUB)

    cap = font(16)
    for i, fr in enumerate(sheet["frames"]):
        r, c = divmod(i, cols)
        y = header + r * (TILE + band)
        im.paste(_load(frame_dir, fr["f"]), (c * TILE, y))
        colour = AMBER if fr.get("standIn") else TEXT
        for j, line in enumerate(wrap(d, fr["c"], cap, TILE - 20)):
            d.text((c * TILE + 8, y + TILE + 6 + j * 21), line, font=cap, fill=colour)
    out = out_dir / f"{sheet['id']}.png"
    im.save(out)
    return out


def build_contrast(spec: dict, frame_dir: Path, out_dir: Path) -> Path:
    cols, band, header = 4, 70, 60
    frames = spec["frames"]
    rows = (len(frames) + cols - 1) // cols
    im = Image.new("RGB", (cols * TILE, header + rows * (TILE + band)), BG)
    d = ImageDraw.Draw(im)
    d.text((14, 14), spec["title"], font=font(29), fill=TEXT)
    for i, fr in enumerate(frames):
        r, c = divmod(i, cols)
        y = header + r * (TILE + band)
        im.paste(_load(frame_dir, fr["f"]), (c * TILE, y))
        d.text((c * TILE + 8, y + TILE + 8), fr["c"], font=font(19), fill=TEXT)
        d.text((c * TILE + 8, y + TILE + 34), fr["c2"], font=font(17), fill=SUB)
    out = out_dir / f"{spec['id']}.png"
    im.save(out)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--only", default="", help="comma-separated sheet ids")
    args = ap.parse_args()
    only = {s for s in args.only.split(",") if s}
    frame_dir = REPO_ROOT / SPEC["frameDir"]
    out_dir = REPO_ROOT / SPEC["outDir"]
    out_dir.mkdir(parents=True, exist_ok=True)
    for sheet in SPEC["sheets"]:
        if not only or sheet["id"] in only:
            print("[vibe]", build_sheet(sheet, frame_dir, out_dir))
    if not only or SPEC["contrast"]["id"] in only:
        print("[vibe]", build_contrast(SPEC["contrast"], frame_dir, out_dir))


if __name__ == "__main__":
    main()
