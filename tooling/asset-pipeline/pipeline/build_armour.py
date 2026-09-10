"""Host-side batch builder for wearable armour.

Same shape as the arsenal builder — extract every declared NIF and its textures
into one data-root, hand a single plan to headless Wine/Blender — but the pieces
are skinned, so they are built against the production skeleton and exported with
it. Adding a piece is one entry in ``config/armour/<set>.json``.

Usage:
    python -m pipeline.build_armour
    python -m pipeline.build_armour --only steel-cuirass
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from .bsa import BSAArchive
from .build import BUILD_DIR, TOOLCHAIN, _expand, _referenced_textures, to_windows
from .models import CONFIG, ROOT

ARMOUR_SCRIPT = Path(__file__).resolve().parent / "blender" / "build_armour.py"

# How far the collar of a finished cuirass may sit from the reference body's
# neck polyline, in source units. The snap puts it on the polyline, so this is a
# residual tolerance, not a target: anything above it means the ring the build
# identified as a collar was not moved, and the head will hang clear of it.
NECK_SEAM_TOLERANCE = 1e-4


def reference_bodies(config: dict) -> dict:
    """The bodies a cuirass collar is closed against, by sex.

    Read from the set's body profile(s) rather than a hardcoded male mesh: the
    roster is gaining female bodies, and a cuirass has to close against the neck
    of the body it is actually worn over. ``bodies`` (a list) wins over the
    singular ``body`` when a set declares one.

    **The weight-zero body is the reference**, and that is the whole trick.
    Skyrim morphs a body between its ``_0`` and ``_1`` meshes by the NPC's NAM7
    weight, and each roster head is stitched to its own build's blended body —
    so across the roster the neck ring is a *range* of radii, while one armour
    GLB is worn by all of them. Measured on the shipped builds, that range is
    0.522 to 0.573 (Nord) source units.

    Head neck and collar are two open cylinders at the same height. A collar
    *wider* than the neck leaves an annulus with nothing behind it: that is the
    white ring, and it is what shipped — the ``_1`` collar measures 0.609,
    wider than every head in the roster. A collar *narrower* than the neck is
    buried under the skin, which covers it. So the safe bound is the narrowest
    neck any build can have, which is the weight-zero body — no roster
    knowledge required, and it stays right when races or weights change.
    """
    profiles = config.get("bodies") or [config["body"]]
    out = {}
    for body_id in profiles:
        body = json.loads((CONFIG / "bodies" / f"{body_id}.json").read_text())
        entry = next((m for m in body["meshes"] if m["name"] == "body"), None)
        if entry is None:
            raise ValueError(f"body profile {body_id} declares no 'body' mesh")
        # Same derivation the character build uses for the weight-blend pair.
        mesh_file = entry["file"]
        if mesh_file.endswith("_1.nif"):
            mesh_file = mesh_file[:-6] + "_0.nif"
        sex = "female" if "female" in body_id.lower() else "male"
        out.setdefault(sex, {
            "id": body_id,
            "mesh": f"{body['meshDir']}/{mesh_file}",
            "import": body["import"],
        })
    return out


def sex_of(nif: str) -> str:
    """Which body a piece is authored for, read from Bethesda's own path."""
    return "female" if "/female/" in nif.replace("\\", "/").lower() else "male"


def resolve_set(set_id: str, only: list[str] | None) -> dict:
    config = json.loads((CONFIG / "armour" / f"{set_id}.json").read_text())
    slots = config["slots"]
    wanted = set(only or [])
    items, seen = [], set()
    for entry in config["items"]:
        item_id = entry["id"]
        if item_id in seen:
            raise ValueError(f"duplicate armour id: {item_id}")
        seen.add(item_id)
        if wanted and item_id not in wanted:
            continue
        if entry["slot"] not in slots:
            raise ValueError(f"{item_id}: unknown slot {entry['slot']}")
        items.append(dict(entry))
    missing = wanted - seen
    if missing:
        raise ValueError(f"unknown armour id(s): {sorted(missing)}")
    if not items:
        raise ValueError("no armour selected")
    return {"config": config, "items": items}


def assemble_data_root(set_id: str, items: list[dict], bodies: dict | None = None) -> Path:
    work = BUILD_DIR / "armour" / set_id
    data_root = work / "data-root"
    if data_root.exists():
        shutil.rmtree(data_root)
    data_root.mkdir(parents=True, exist_ok=True)

    mesh_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / "Skyrim - Meshes.bsa")
    texture_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["textureBsa"])

    wanted: set[str] = set()
    for item in items:
        if not mesh_bsa.contains(item["nif"]):
            raise KeyError(f"{item['id']}: {item['nif']} not in the mesh archive")
        mesh_bsa.extract([item["nif"]], data_root)
        item["nif_path"] = data_root / item["nif"]
        wanted |= _referenced_textures(item["nif_path"])

    # The reference body is geometry only: it is imported to supply the neck
    # polyline and its skin weights, and is never exported or textured.
    for body in (bodies or {}).values():
        if not mesh_bsa.contains(body["mesh"]):
            raise KeyError(f"reference body {body['id']}: {body['mesh']} not in the mesh archive")
        mesh_bsa.extract([body["mesh"]], data_root)
        body["mesh_path"] = data_root / body["mesh"]

    filled, absent = [], []
    for texture in sorted(wanted):
        if texture_bsa.contains(texture):
            texture_bsa.extract([texture], data_root)
            filled.append(texture)
        else:
            absent.append(texture)
    print(f"[armour] pieces={len(items)} textures referenced={len(wanted)} "
          f"filled={len(filled)} unresolved={len(absent)}")
    for texture in absent:
        print(f"[armour]   UNRESOLVED texture: {texture}")
    return work


def validate_neck_seams(items: list[dict], seam_slots: set[str], built: dict) -> None:
    """Reject an export whose collar does not meet the head.

    The character side has the matching check (``validate_facegen_summary``),
    but it only ever measured the head against the **bare** body — the one
    configuration that is never on screen once armour is worn. That is why a
    genuinely open iron collar shipped green: the head hung clear of the cuirass
    and the scene's clear colour showed through as a white ring at the neck.

    Every value below is measured by the Blender stage on the assembled mesh
    *after* the snap, not asserted by it.
    """
    failures = []
    for item in items:
        if item["slot"] not in seam_slots:
            continue
        seam = built.get(item["id"], {}).get("neckSeam")
        if not seam:
            failures.append(f"{item['id']}: the build reported no neck-seam measurement")
            continue
        if seam.get("collar") == "none":
            # A closed-neck design — elven is the vanilla example: no boundary
            # encircles the neck at all, so there is no opening to stitch. The
            # near-miss measurements go in the summary rather than being
            # asserted away, so this stays distinguishable from a missed search.
            print(f"[armour] {item['id']}: closed-neck design, no collar to stitch "
                  f"({len(seam.get('nearMisses', []))} near miss(es) recorded)")
            continue
        if seam.get("snappedVertices", 0) < 8:
            failures.append(
                f"{item['id']}: only {seam.get('snappedVertices', 0)} collar vertices "
                "were stitched")
        after = seam.get("maxDistanceAfter")
        if after is None or after > NECK_SEAM_TOLERANCE:
            failures.append(f"{item['id']}: collar/neck seam remains open ({after})")
            continue
        # Girth needs no separate check: `maxDistanceAfter` says the collar lies
        # *on* the reference neck polyline, so at every angle it is exactly the
        # narrowest neck's girth and cannot stand proud of any build's skin.
        # (`collarRadius` is reported as evidence, but comparing two means over
        # different vertex distributions around a non-circular neck is not a
        # test — it reads high whenever a 14-vertex collar happens to sample the
        # wider front and back of the ring.)
        #
        # The lift is the half that can fail, and it is what makes one GLB right
        # for ten builds, so it is measured on the finished collar.
        if seam["collarHeight"] <= seam["referenceNeckHeight"]:
            failures.append(
                f"{item['id']}: collar does not reach above the neck ring "
                f"({seam['collarHeight']} <= {seam['referenceNeckHeight']}); "
                "it would leave an open band under the jaw")
        print(f"[armour] {item['id']}: collar seam "
              f"{seam['maxDistanceBefore']} -> {after} units on "
              f"{seam['snappedVertices']} vertices ({seam['referenceBody']}); "
              f"radius {seam['collarRadius']}/{seam['referenceNeckRadius']}, "
              f"height {seam['collarHeight']}/{seam['referenceNeckHeight']}")
    if failures:
        raise RuntimeError("armour neck seams invalid: " + "; ".join(failures))


def build(set_id: str = "armour", only: list[str] | None = None,
          render_icons: bool = True) -> dict:
    resolved = resolve_set(set_id, only)
    config, items = resolved["config"], resolved["items"]
    bodies = reference_bodies(config)
    work = assemble_data_root(set_id, items, bodies)

    rig = json.loads((CONFIG / "rigs" / f"{config['rig']}.json").read_text())
    body = json.loads((CONFIG / "bodies" / f"{config['body']}.json").read_text())
    # Only pieces that meet the head have a collar to close.
    seam_slots = {name for name, slot in config["slots"].items()
                  if slot["equipSlot"] == "chest"}
    output_dir = (ROOT / config["outputDir"]).resolve()
    icon_dir = (ROOT / config["iconDir"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    icon_dir.mkdir(parents=True, exist_ok=True)

    summary_json = work / "summary.json"
    summary_json.unlink(missing_ok=True)
    plan_path = work / "armour-plan.json"
    plan_path.write_text(json.dumps({
        "addon": TOOLCHAIN["addon"],
        "skeleton": to_windows((ROOT / rig["skeleton"]).resolve()),
        "rig_import": rig["import"],
        "mesh_import": body["import"],
        "icon_size": config.get("iconSizePixels", 160),
        # Icons are the slow half of the build (path-traced on CPU) and only
        # change when the art does. A geometry-only rebuild can keep them.
        "render_icons": render_icons,
        "reference_bodies": {
            sex: {"id": entry["id"], "nif": to_windows(entry["mesh_path"]),
                  "import": entry["import"]}
            for sex, entry in bodies.items()
        },
        "items": [{
            "id": item["id"],
            "nif": to_windows(item["nif_path"]),
            # Which reference body's neck this piece's collar is closed against,
            # and whether it has a collar at all. Boots and gauntlets do not.
            "body_sex": sex_of(item["nif"]),
            "close_neck_seam": item["slot"] in seam_slots,
            "output_glb": to_windows(output_dir / f"{item['id']}.glb"),
            "icon_png": to_windows(icon_dir / f"{item['id']}.png"),
        } for item in items],
        "summary_json": to_windows(summary_json),
    }, indent=2))

    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    print(f"[armour] launching headless build for {len(items)} piece(s)...")
    proc = subprocess.run(
        [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
         "--background", "--python", to_windows(ARMOUR_SCRIPT)],
        env=env, capture_output=True, text=True,
        timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900) + 30 * len(items),
    )
    completed = any(line.strip() == "SUMMARY_WRITTEN" for line in proc.stdout.splitlines())
    for line in proc.stdout.splitlines():
        if line.startswith("[armour]"):
            print("   " + line)
    if not completed or not summary_json.exists():
        sys.stderr.write(proc.stdout[-4000:] + proc.stderr[-4000:])
        raise RuntimeError("armour batch build failed")

    summary = json.loads(summary_json.read_text())
    built = summary.get("items", {})
    missing = [item["id"] for item in items if item["id"] not in built]
    if missing:
        raise RuntimeError(f"pieces missing from the build: {missing}")
    validate_neck_seams(items, seam_slots, built)

    manifest = {
        "set": set_id,
        "slots": config["slots"],
        "items": {
            item["id"]: {
                "slot": item["slot"],
                "material": item["material"],
                "asset": f"{Path(config['outputDir']).name}/{item['id']}.glb",
                "icon": f"{Path(config['iconDir']).name}/{item['id']}.png",
                # Read out of the NIF, never declared: this is what the game
                # hides under the piece.
                "coversBipedSlots": built[item["id"]]["coversBipedSlots"],
                "sizeMeters": built[item["id"]]["sizeMeters"],
            }
            for item in items
        },
    }
    manifest_path = (ROOT / config["manifestOutput"]).resolve()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"[armour] manifest -> {manifest_path}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build wearable armour.")
    parser.add_argument("--set", default="armour")
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--no-icons", action="store_true",
                        help="reuse the existing icons and rebuild geometry only")
    args = parser.parse_args()
    build(args.set, args.only, render_icons=not args.no_icons)


if __name__ == "__main__":
    main()
