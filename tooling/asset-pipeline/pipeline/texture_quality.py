"""Measure what GPU texture compression did to a kit's textures.

    python3 -m pipeline.texture_quality --source output/kits/x.glb \
        --packed apps/world-studio/public/kits/x.glb [--crops out/dir --pick material,...]

Both GLBs are dumped with `kit_textures_dump.mjs` (the PNG bytes of the
source, the KTX2 images of the packed build transcoded to RGBA8 with the
runtime's own Basis transcoder) and compared per material slot:

* every slot: PSNR of the colour channels over the texels that are visible
  (alpha >= 0.5 for a MASK material, all texels otherwise) — dB, higher is
  better, 40+ is indistinguishable at kit texture sizes;
* MASK materials (foliage cards and leaves): the share of texels whose side
  of the alpha-test cutoff flipped — the number that decides whether a leaf
  edge grows, shrinks or sprouts specks;
* normal slots: the mean and 95th-percentile angular error of the decoded
  normal, in degrees.

`--crops` writes source|packed pairs (nearest-neighbour 4x, alpha shown as a
checkerboard) for a visual review by a separate agent.
"""
from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

DUMP = Path(__file__).with_name("kit_textures_dump.mjs")


def dump(glb: Path, out: Path) -> dict:
    subprocess.run(["node", str(DUMP), str(glb), str(out)], check=True,
                   capture_output=True, text=True)
    return json.loads((out / "index.json").read_text())


def _load(dump_dir: Path, image: dict) -> np.ndarray:
    data = (dump_dir / image["file"]).read_bytes()
    if image["encoding"] == "rgba":
        return np.frombuffer(data, np.uint8).reshape(image["height"], image["width"], 4)
    if image["encoding"] in ("uastc", "etc1s"):
        return np.frombuffer(data, np.uint8).reshape(image["height"], image["width"], 4)
    return np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))


def _psnr(a: np.ndarray, b: np.ndarray, mask: np.ndarray) -> float:
    if not mask.any():
        return float("inf")
    diff = a[mask].astype(np.float64) - b[mask].astype(np.float64)
    mse = float(np.mean(diff * diff))
    return float("inf") if mse == 0 else 10.0 * np.log10(255.0 * 255.0 / mse)


def _normal_error_deg(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    def decode(x):
        n = x[..., :3].astype(np.float64) / 255.0 * 2.0 - 1.0
        return n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    dot = np.clip(np.sum(decode(a) * decode(b), axis=-1), -1.0, 1.0)
    deg = np.degrees(np.arccos(dot)).ravel()
    return float(deg.mean()), float(np.percentile(deg, 95))


def compare(source_glb: Path, packed_glb: Path, crops: Path | None = None,
            pick: set[str] | None = None) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        src_dir, dst_dir = Path(tmp) / "src", Path(tmp) / "dst"
        src, dst = dump(source_glb, src_dir), dump(packed_glb, dst_dir)
        src_images = {i["index"]: i for i in src["images"]}
        dst_images = {i["index"]: i for i in dst["images"]}
        src_slots = {(s["material"], s["slot"]): s for s in src["slots"]}
        rows = []
        cache: dict[tuple, np.ndarray] = {}
        for slot in dst["slots"]:
            key = (slot["material"], slot["slot"])
            if key not in src_slots:
                rows.append({"material": key[0], "slot": key[1], "missingInSource": True})
                continue
            a_meta, b_meta = src_images[src_slots[key]["image"]], dst_images[slot["image"]]
            a = cache.get(("a", a_meta["index"]))
            if a is None:
                a = cache[("a", a_meta["index"])] = _load(src_dir, a_meta)
            b = cache.get(("b", b_meta["index"]))
            if b is None:
                b = cache[("b", b_meta["index"])] = _load(dst_dir, b_meta)
            resized = False
            if a.shape != b.shape:
                a = np.asarray(Image.fromarray(a).resize((b.shape[1], b.shape[0]), Image.BILINEAR))
                resized = True
            masked = src_slots[key]["alphaMode"] == "MASK"
            visible = (a[..., 3] >= 128) if masked else np.ones(a.shape[:2], bool)
            row = {"material": key[0], "slot": slot["slot"], "encoding": b_meta["encoding"],
                   "width": int(b.shape[1]), "height": int(b.shape[0]),
                   "sourceBytes": a_meta["bytes"], "packedBytes": b_meta["bytes"],
                   "psnrRgbDb": round(_psnr(a[..., :3], b[..., :3], visible), 2)}
            if resized:
                row["sourceResized"] = True
            if masked:
                flipped = (a[..., 3] >= 128) != (b[..., 3] >= 128)
                row["alphaCutoutFlippedPct"] = round(100.0 * float(flipped.mean()), 4)
                row["alphaPsnrDb"] = round(_psnr(a[..., 3:], b[..., 3:], np.ones(a.shape[:2], bool)), 2)
            if slot["slot"] == "normal":
                mean_deg, p95_deg = _normal_error_deg(a, b)
                row["normalErrorMeanDeg"] = round(mean_deg, 3)
                row["normalErrorP95Deg"] = round(p95_deg, 3)
            rows.append(row)
            if crops is not None and (pick is None or key[0] in pick):
                _write_crop(crops, key, a, b)
    return {"source": str(source_glb), "packed": str(packed_glb), "slots": rows,
            "summary": summarise(rows)}


def summarise(rows: list[dict]) -> dict:
    by = {}
    for r in rows:
        if "psnrRgbDb" not in r:
            continue
        g = by.setdefault(f"{r['slot']}/{r['encoding']}", {"count": 0, "psnr": [], "flip": [], "n95": []})
        g["count"] += 1
        g["psnr"].append(r["psnrRgbDb"])
        if "alphaCutoutFlippedPct" in r:
            g["flip"].append(r["alphaCutoutFlippedPct"])
        if "normalErrorP95Deg" in r:
            g["n95"].append(r["normalErrorP95Deg"])
    out = {}
    for k, g in by.items():
        finite = [p for p in g["psnr"] if np.isfinite(p)]
        out[k] = {"count": g["count"],
                  "psnrRgbDbMin": round(min(finite), 2) if finite else None,
                  "psnrRgbDbMedian": round(float(np.median(finite)), 2) if finite else None}
        if g["flip"]:
            out[k]["alphaCutoutFlippedPctMax"] = round(max(g["flip"]), 4)
            out[k]["alphaCutoutFlippedPctMedian"] = round(float(np.median(g["flip"])), 4)
        if g["n95"]:
            out[k]["normalErrorP95DegMax"] = round(max(g["n95"]), 3)
    return out


def _write_crop(out: Path, key: tuple[str, str], a: np.ndarray, b: np.ndarray, zoom: int = 4,
                size: int = 128) -> None:
    out.mkdir(parents=True, exist_ok=True)
    h, w = a.shape[:2]
    # The busiest window: most visible texels with the most luminance detail
    # (a centre crop of a card atlas is often blank).
    lum = a[..., :3].astype(np.float64).mean(axis=-1) * (a[..., 3] >= 128)
    best, y0, x0 = -1.0, 0, 0
    for y in range(0, max(1, h - size + 1), max(1, size // 2)):
        for x in range(0, max(1, w - size + 1), max(1, size // 2)):
            win = lum[y:y + size, x:x + size]
            score = float(win.std() * (win > 0).mean())
            if score > best:
                best, y0, x0 = score, y, x
    tiles = []
    for img in (a, b):
        crop = img[y0:y0 + size, x0:x0 + size]
        yy, xx = np.mgrid[:crop.shape[0], :crop.shape[1]]
        checker = np.where(((yy // 8 + xx // 8) % 2) == 0, 200, 120).astype(np.float64)
        alpha = crop[..., 3:4].astype(np.float64) / 255.0
        rgb = crop[..., :3].astype(np.float64) * alpha + checker[..., None] * (1 - alpha)
        tile = Image.fromarray(rgb.astype(np.uint8)).resize(
            (crop.shape[1] * zoom, crop.shape[0] * zoom), Image.NEAREST)
        tiles.append(tile)
    sheet = Image.new("RGB", (tiles[0].width + tiles[1].width + 8, max(t.height for t in tiles)), (0, 0, 0))
    sheet.paste(tiles[0], (0, 0))
    sheet.paste(tiles[1], (tiles[0].width + 8, 0))
    safe = key[0].replace("/", "_").replace(":", "_")
    sheet.save(out / f"{safe}.{key[1]}.png")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--source", required=True, type=Path)
    ap.add_argument("--packed", required=True, type=Path)
    ap.add_argument("--crops", type=Path)
    ap.add_argument("--pick", help="comma-separated material names to crop")
    ap.add_argument("--json", type=Path, help="write the full report here")
    args = ap.parse_args()
    report = compare(args.source, args.packed, args.crops,
                     set(args.pick.split(",")) if args.pick else None)
    if args.json:
        args.json.write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report["summary"], indent=1))


if __name__ == "__main__":
    sys.exit(main())
