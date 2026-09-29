"""Silhouette check and contact sheets for the tree tiers (vegetation round 13).

For each asset: `tree_tiers.preview` writes a GLB with its source, mid and far
levels; native Linux Blender renders them (`blender/render_tree_tiers.py`)
from eight azimuths at each tier's HAND-OVER distance, expressed as the pixel
height the tree has on a 1080-px, 60-degree screen there:

    mid  swaps in at clamp(h x 2.5, 18, 60) m   (floraKit ring 0)
    far  swaps in at clamp(h x 5, 50, 140) m    (floraKit ring 1, low band:
                                                 the nearest, strictest)

Bar (round 13 brief): coverage-mask IoU >= 0.9 against the source at that
distance, and no single view losing more than 5 % of the source's coverage.
Writes `<out>/<asset>/result.json`, and one labelled contact sheet per tier
(source row over tier row, eight views) for the image judge.

    python3 -m pipeline.tree_tiers_check --kit flora-province-v1 \
        --assets <id,...> --out <dir> [--set far.leafKeep=0.08]
    ... --calibrate [--bark-ladder --set mid.leafKeep=1]   # settings ladders
    ... --calibrate --tiers mid --keeps mid=0.1,0.2 --max-share 0.95  # round 13d
    ... --out <cal dir> --record        # lightest passing -> kit config
"""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
from pathlib import Path

import numpy as np

from . import tree_tiers

BLENDER = Path(os.path.expanduser("~/tools/blender-3.2.2-linux-x64/blender"))
SCRIPT = Path(__file__).resolve().parent / "blender" / "render_tree_tiers.py"
SCREEN_PX, FOV_DEG = 1080, 60.0
AZIMUTHS = 8
IOU_MIN, VIEW_LOSS_MAX = 0.90, 0.05
#: Closing radius of the silhouette mask, a share of the tree pixel height.
SILHOUETTE_CLOSE = 0.015


def handover_m(height_m: float) -> dict[str, float]:
    return {"mid": min(60.0, max(18.0, height_m * 2.5)),
            "far": min(140.0, max(50.0, height_m * 5.0))}


def pixel_height(height_m: float, distance_m: float) -> int:
    return max(24, int(round(height_m * SCREEN_PX
                             / (2 * distance_m * math.tan(math.radians(FOV_DEG / 2))))))


def mask(path: Path) -> np.ndarray:
    from PIL import Image
    return np.asarray(Image.open(path).getchannel("A")) > 127


def closed(m: np.ndarray, radius: int) -> np.ndarray:
    """The silhouette: the mask closed by a disc of `radius` px (the gaps
    between single leaf strands filled, the outline kept)."""
    from scipy import ndimage
    yy, xx = np.mgrid[-radius:radius + 1, -radius:radius + 1]
    disc = xx * xx + yy * yy <= radius * radius
    padded = np.pad(m, radius + 1)
    return ndimage.binary_closing(padded, disc)[radius + 1:-radius - 1, radius + 1:-radius - 1]


def iou(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.logical_and(a, b).sum() / max(np.logical_or(a, b).sum(), 1))


_SOURCE_CACHE: dict = {}


def _source(out: Path, px: int, k: int, radius: int):
    """Source mask, its silhouette and the jitter mask, read once per view."""
    key = (str(out), px, k)
    if key not in _SOURCE_CACHE:
        a = mask(out / f"source_{px}_{k:02d}.png")
        j = mask(out / f"jitter_{px}_{k:02d}.png")
        _SOURCE_CACHE[key] = (a, closed(a, radius), iou(a, j))
    return _SOURCE_CACHE[key]


def score(out: Path, tier: str, px: int) -> dict:
    """Gate: silhouette IoU (masks closed at SILHOUETTE_CLOSE x the tree's
    pixel height) >= IOU_MIN in every view, and no view's raw coverage below
    the source's by more than VIEW_LOSS_MAX. The raw pixel IoU is reported
    beside the source-vs-itself floor (`jitter`: the camera moved half a
    pixel), which shows why raw IoU cannot be the silhouette bar: leaf strands
    one to two pixels wide miss each other on a half-pixel shift."""
    radius = max(1, int(round(px * SILHOUETTE_CLOSE)))
    sil, raw, floor, ratios = [], [], [], []
    for k in range(AZIMUTHS):
        a, a_closed, jitter_iou = _source(out, px, k, radius)
        b = mask(out / f"{tier}_{px}_{k:02d}.png")
        sil.append(iou(a_closed, closed(b, radius)))
        raw.append(iou(a, b))
        floor.append(jitter_iou)
        ratios.append(float(b.sum() / max(a.sum(), 1)))
    return {"px": px, "closeRadiusPx": radius,
            "silhouetteIou": [round(v, 3) for v in sil],
            "rawIou": [round(v, 3) for v in raw],
            "rawIouJitterFloor": [round(v, 3) for v in floor],
            "coverageRatio": [round(v, 3) for v in ratios],
            "iouMin": round(min(sil), 3), "rawIouMin": round(min(raw), 3),
            "jitterFloorMin": round(min(floor), 3),
            "worstLoss": round(1 - min(ratios), 3),
            "pass": min(sil) >= IOU_MIN and 1 - min(ratios) <= VIEW_LOSS_MAX}


def sheet(out: Path, tier: str, px: int, label: str, dest: Path) -> None:
    from PIL import Image, ImageDraw
    first = Image.open(out / f"source_{px}_00.png")
    cell = min(400, max(220, first.width))
    scale = cell / first.width
    rows = [("source", "SOURCE"), (tier, tier.upper())]
    pad, head = 6, 22
    W = AZIMUTHS * (cell + pad) + pad
    H = head + len(rows) * (cell + head + pad)
    im = Image.new("RGB", (W, H), (150, 160, 170))
    dr = ImageDraw.Draw(im)
    dr.text((pad, 4), label, fill=(0, 0, 0))
    for r, (name, title) in enumerate(rows):
        y = head + r * (cell + head + pad)
        for k in range(AZIMUTHS):
            src = Image.open(out / f"{name}_{px}_{k:02d}.png").convert("RGBA")
            size = (int(src.width * scale), int(src.height * scale))
            src = src.resize(size, Image.NEAREST)
            x = pad + k * (cell + pad)
            bg = Image.new("RGBA", size, (150, 160, 170, 255))
            bg.alpha_composite(src)
            im.paste(bg.convert("RGB").crop((0, 0, min(cell, size[0]), min(cell, size[1]))),
                     (x, y + head))
            dr.text((x, y + 4), f"{title} az {k * 360 // AZIMUTHS}", fill=(0, 0, 0))
    im.save(dest)


#: Leaf-keep ladder `--calibrate` tries per tier, lowest first; the lowest
#: that passes the bar is the asset's setting (`treeTiers.perAsset`).
CALIBRATE_KEEPS = {"mid": (0.28, 0.4, 0.55, 0.7), "far": (0.2, 0.3, 0.45, 0.6)}
#: Area-compensation gains tried at every keep: 0.85 for an open crown whose
#: cards barely overlap (willow), 0.4 for a dense one whose thinned cards
#: already cover most of the source (the Anvil canopy: +20 % at 0.85).
CALIBRATE_GAINS = (0.85, 0.4)
#: Bark-tube ladder (`--calibrate --bark-ladder`, round 13b): sides round
#: the tube x the collinear-merge tolerance (m), leaf keep fixed by `--set`.
#: For trees whose bark is most of the triangles (the mangroves' stilt roots).
BARK_SIDES = (4, 5, 6, 8)
BARK_TOLS = (0.03, 0.06, 0.1)
#: The settings a calibrated level records into `treeTiers.perAsset`: only
#: the keys its ladder varied, plus any the run set with `--set`. A default
#: or kit-level key copied into `perAsset` would outrank (`tier_settings`)
#: and silently freeze every later kit-level change for that asset.
LEAF_VARIED = ("leafKeep", "gain")
BARK_VARIED = ("barkTube", "barkSides", "barkTol")
#: Default cap: a tier above this share of the source's triangles is not
#: shipped. A kit sets its own (`treeTiers.maxShare`) and an asset its own
#: (`treeTiers.maxShareByAsset.<id>`, written by `--record` from a
#: `--max-share` calibration): the mangroves' bark is 83-95 % of their
#: triangles, so their best mid lands at 0.8-0.95 (round 13d, planner ruling
#: 2026-09-29: the 0.70 was ours, not the owner's). A level recorded over the
#: kit cap needs the image judges like a bark-tube level.
MAX_SHARE = 0.7


def max_share(kit: dict, asset_id: str) -> float:
    """The share cap for `asset_id`: per asset, else per kit, else MAX_SHARE."""
    cfg = kit.get("treeTiers") or {}
    return float((cfg.get("maxShareByAsset") or {}).get(asset_id, cfg.get("maxShare", MAX_SHARE)))


def choose(labels: dict, counts: dict, scores: dict, cap: float = MAX_SHARE) -> dict:
    """The lightest passing mid, then the lightest passing far lighter than
    it; a level over `cap` of the source saves too little to ship."""
    chosen: dict = {}
    for tier in ("mid", "far"):
        passing = [label for label, t in labels.items() if t == tier and scores[label]["pass"]
                   and counts[label] <= cap * counts["source"]]
        if tier == "far" and chosen.get("mid"):
            passing = [label for label in passing if counts[label] < counts[chosen["mid"]]]
        chosen[tier] = min(passing, key=lambda label: (counts[label], -scores[label]["iouMin"])) \
            if passing else None
    return chosen


def recorded_keys(varied: tuple[str, ...], set_overrides: dict) -> list[str]:
    """The keys a calibrated level records: the ladder's varied keys, then
    the `--set` keys for its tier (sorted, so the record is deterministic)."""
    return list(varied) + sorted(k for k in set_overrides if k not in varied)


def rechoose(result: dict) -> dict:
    """`choose` over a written result.json (a rule change needs no re-render)."""
    levels = result["levels"]
    labels = {label: row["tier"] for label, row in levels.items()}
    counts = {"source": result["source"], **{label: row["triangles"] for label, row in levels.items()}}
    return choose(labels, counts, levels, result.get("maxShare", MAX_SHARE))


def check(kit_id: str, asset_ids: list[str], out_root: Path, overrides: dict,
          samples: int = 6, calibrate: bool = False, bark_ladder: bool = False,
          tiers: tuple[str, ...] = ("mid", "far"), keeps: dict | None = None,
          cap: float | None = None) -> dict:
    """`tiers`: the tiers a calibration renders (the others keep their kit
    rows on `--record`); `keeps`: a leaf-keep ladder per tier replacing
    CALIBRATE_KEEPS; `cap`: the share cap, else `max_share` from the kit."""
    kit = json.loads((tree_tiers.CONFIG / f"{kit_id}.json").read_text())
    glb = (tree_tiers.REPO_ROOT / kit["output"]).resolve()
    manifest = json.loads(glb.with_suffix(".kit.json").read_text())
    heights = {a["id"]: a["sizeM"][2] for a in manifest["assets"]}
    results = {}
    for asset_id in asset_ids:
        variants = None
        varied: tuple[str, ...] = ()
        if calibrate:
            base = {t: {**tree_tiers.DEFAULT_TIERS[t], **((kit.get("treeTiers") or {}).get(t) or {}),
                        **overrides.get(t, {})} for t in ("mid", "far")}
            variants = {f"{t}-k{int(round(k * 100)):02d}g{int(round(g * 100)):02d}":
                        (t, {**base[t], "leafKeep": k, "gain": g})
                        for t, ladder in {**CALIBRATE_KEEPS, **(keeps or {})}.items()
                        if t in tiers for k in ladder for g in CALIBRATE_GAINS}
            varied = LEAF_VARIED
            if bark_ladder:
                varied = BARK_VARIED
                variants = {f"{t}-s{n}t{int(round(tol * 100)):02d}":
                            (t, {**base[t], "barkTube": int(base[t].get("barkTube") or 1),
                                 "barkSides": n, "barkTol": tol})
                            for t in tiers for n in BARK_SIDES for tol in BARK_TOLS}
        counts = tree_tiers.preview(glb, [asset_id], out_root / "glb", kit, overrides,
                                    variants)[asset_id]
        labels = {label: (variants[label][0] if variants else label)
                  for label in counts if label != "source"}
        safe = asset_id.replace(":", "__").replace("/", "_")
        out = out_root / safe
        out.mkdir(parents=True, exist_ok=True)
        h = heights[asset_id]
        dist = handover_m(h)
        px = {t: pixel_height(h, d) for t, d in dist.items()}
        renders = []
        for tier in sorted(set(labels.values())):
            renders += [["source", px[tier]], ["jitter", px[tier]]]
            renders += [[label, px[tier]] for label, t in labels.items() if t == tier]
        job = {"glb": str(out_root / "glb" / f"{safe}.glb"), "outDir": str(out),
               "azimuths": AZIMUTHS, "elevationDeg": 0.0, "samples": samples,
               "renders": renders}
        job_path = out / "job.json"
        job_path.write_text(json.dumps(job))
        proc = subprocess.run([str(BLENDER), "-b", "--python", str(SCRIPT), "--", str(job_path)],
                              capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(proc.stdout[-3000:] + proc.stderr[-3000:])
        scores = {label: score(out, label, px[tier]) for label, tier in labels.items()}
        asset_cap = cap if cap is not None else max_share(kit, asset_id)
        chosen = choose(labels, counts, scores, asset_cap)
        result = {"assetId": asset_id, "heightM": h, "handoverM": dist, "px": px,
                  "source": counts["source"], "maxShare": asset_cap,
                  "tiers": [t for t in ("mid", "far") if t in set(labels.values())],
                  "levels": {label: {"tier": labels[label], "triangles": counts[label],
                                     "share": round(counts[label] / counts["source"], 3),
                                     **({"settings": {key: variants[label][1][key]
                                                      for key in recorded_keys(
                                                          varied, overrides.get(labels[label], {}))}}
                                        if variants else {}),
                                     **scores[label]} for label in labels},
                  "chosen": chosen}
        if calibrate:
            result["perAsset"] = {t: (result["levels"][chosen[t]]["settings"]
                                      if chosen[t] else None) for t in ("mid", "far")}
        for tier in ("mid", "far"):
            label = chosen[tier] or next((lbl for lbl, t in labels.items() if t == tier), None)
            if label is None:
                continue
            verdict = "PASS" if chosen[tier] else "FAIL (best shown)"
            sheet(out, label, px[tier],
                  f"{asset_id}  {tier} tier ({label}) at {dist[tier]:.0f} m ({px[tier]} px tall)"
                  f"  source {counts['source']} tris -> {counts[label]}  auto-check {verdict}",
                  out_root / f"{safe}-{tier}.png")
        (out / "result.json").write_text(json.dumps(result, indent=1))
        results[asset_id] = result
        for label, row in result["levels"].items():
            print(f"{asset_id} {label}: {row['triangles']} ({row['share']:.0%}) "
                  f"silIoU {row['iouMin']} raw {row['rawIouMin']}/floor {row['jitterFloorMin']} "
                  f"loss {row['worstLoss']} {'PASS' if row['pass'] else 'FAIL'}")
        print(f"{asset_id} chosen: {chosen}")
    return results


#: A bark-tube level needs this many image judges, every one PASS (round 13c).
JUDGES_MIN = 2


def judge_path(cal_dir: Path, safe: str, tier: str) -> Path:
    """The image judges' verdict file, beside the tier's contact sheet."""
    return cal_dir / f"{safe}-{tier}.judge.json"


def judge_passed(cal_dir: Path, safe: str, tier: str, label: str) -> str | None:
    """None when the judge file beside the sheet passes `label`, else why not.
    File: {"label": <level label>, "judges": [{"verdict": "PASS"|"FAIL",
    "note": ...}, ...]}, written from the Sonnet judges' replies."""
    path = judge_path(cal_dir, safe, tier)
    if not path.exists():
        return f"no judge file {path.name}"
    doc = json.loads(path.read_text())
    if doc.get("label") != label:
        return f"{path.name} judged {doc.get('label')!r}, the chosen level is {label!r}"
    verdicts = [j.get("verdict") for j in doc.get("judges") or []]
    if len(verdicts) < JUDGES_MIN or any(v != "PASS" for v in verdicts):
        return f"{path.name} verdicts {verdicts} (need {JUDGES_MIN}+ PASS, no FAIL)"
    return None


def record(kit_id: str, cal_dir: Path) -> dict:
    """Write each calibrated asset's chosen settings into the kit config
    (`treeTiers.assets` + `treeTiers.perAsset`, null = tier not built); an
    asset with neither tier passing is left out of `assets`.

    Hard gate (round 13c): the silhouette bar cannot see a cone inside a root
    mass or a trunk break a few pixels wide, so a chosen BARK-TUBE level, or
    a level over the kit's share cap (round 13d), is refused (SystemExit,
    nothing written) unless `judge_passed` finds a PASS file from JUDGES_MIN
    image judges beside its contact sheet.

    A tier the calibration did not render (`--tiers`) keeps its kit row; the
    result's `maxShare`, when it differs from the kit cap, is written to
    `treeTiers.maxShareByAsset`."""
    path = tree_tiers.CONFIG / f"{kit_id}.json"
    kit = json.loads(path.read_text())
    tiers = kit.setdefault("treeTiers", {})
    per = tiers.setdefault("perAsset", {})
    kit_cap = float(tiers.get("maxShare", MAX_SHARE))
    refused = []
    for result_path in sorted(cal_dir.glob("*/result.json")):
        result = json.loads(result_path.read_text())
        chosen = rechoose(result)
        for tier in ("mid", "far"):
            level = result["levels"].get(chosen[tier]) if chosen[tier] else None
            if level and ((level.get("settings") or {}).get("barkTube")
                          or level["triangles"] > kit_cap * result["source"]):
                why = judge_passed(cal_dir, result_path.parent.name, tier, chosen[tier])
                if why:
                    refused.append(f"{result['assetId']} {tier} {chosen[tier]}: {why}")
    if refused:
        raise SystemExit("tree_tiers_check --record refused (bark-tube or over-cap level "
                         "without an image-judge PASS):\n  " + "\n  ".join(refused))
    for result_path in sorted(cal_dir.glob("*/result.json")):
        result = json.loads(result_path.read_text())
        chosen = rechoose(result)
        rendered = result.get("tiers", ["mid", "far"])
        row = dict(per.get(result["assetId"]) or {"mid": None, "far": None})
        caps = tiers.setdefault("maxShareByAsset", {})
        if result.get("maxShare", kit_cap) != kit_cap:
            caps[result["assetId"]] = result["maxShare"]
        else:
            caps.pop(result["assetId"], None)
        if not caps:
            tiers.pop("maxShareByAsset")
        for tier in rendered:
            level = result["levels"].get(chosen[tier]) if chosen[tier] else None
            row[tier] = None if level is None else level.get("settings") or {
                "leafKeep": float(chosen[tier].split("-k")[1][:2]) / 100,
                "gain": float(chosen[tier].split("g")[-1]) / 100}
        per[result["assetId"]] = row
        safe = result_path.parent.name
        for tier in rendered:
            dest = cal_dir / f"{safe}-{tier}.png"
            dest.unlink(missing_ok=True)
            if chosen[tier]:
                level = result["levels"][chosen[tier]]
                sheet(result_path.parent, chosen[tier], level["px"],
                      f"{result['assetId']}  {tier} tier ({chosen[tier]}) at "
                      f"{result['handoverM'][tier]:.0f} m ({level['px']} px tall)  source "
                      f"{result['source']} tris -> {level['triangles']}  auto-check PASS", dest)
    tiers["assets"] = sorted(a for a, row in per.items() if any(row.values()))
    path.write_text(json.dumps(kit, indent=1, ensure_ascii=False) + "\n")
    return per


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--kit", required=True)
    parser.add_argument("--assets")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--record", action="store_true",
                        help="write the chosen settings under --out into the kit config")
    parser.add_argument("--samples", type=int, default=6)
    parser.add_argument("--set", action="append", default=[])
    parser.add_argument("--calibrate", action="store_true",
                        help="try the CALIBRATE_KEEPS ladder, report the lowest passing keep")
    parser.add_argument("--bark-ladder", action="store_true",
                        help="with --calibrate: the bark-tube ladder (BARK_SIDES x BARK_TOLS)")
    parser.add_argument("--tiers", default="mid,far",
                        help="with --calibrate: the tiers to render (others keep their kit rows)")
    parser.add_argument("--keeps", action="append", default=[],
                        help="with --calibrate: <tier>=k1,k2,... replaces CALIBRATE_KEEPS[tier]")
    parser.add_argument("--max-share", type=float,
                        help="share cap for this run (recorded per asset by --record)")
    args = parser.parse_args()
    overrides: dict = {}
    for item in args.set:
        key, value = item.split("=")
        tier, field = key.split(".")
        overrides.setdefault(tier, {})[field] = float(value)
    if args.record:
        print(json.dumps(record(args.kit, args.out), indent=1))
        return
    keeps = {t: tuple(float(k) for k in ks.split(","))
             for t, ks in (item.split("=") for item in args.keeps)}
    results = check(args.kit, args.assets.split(","), args.out, overrides, args.samples,
                    args.calibrate, args.bark_ladder, tuple(args.tiers.split(",")), keeps,
                    args.max_share)
    (args.out / "results.json").write_text(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
