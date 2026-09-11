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
import hashlib
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

SEXES = ("male", "female")

#: How far a piece's neck ring may sit from the reference body's neck polyline
#: and still count as *being* that polyline, in source units.
#:
#: A cuirass that embeds the body's neck-bearing part copies its loop
#: bit-for-bit, so the honest expected value there is zero; measured across the
#: set it comes out at 0-2e-6, which is float noise through two import paths and
#: a world matrix. Reported as evidence, not used as a pass/fail bound: most
#: vanilla cuirasses close the neck with their own authored opening instead, and
#: that opening is legitimately proud of the neck.
NECK_RING_ON_NECK = 1e-4


def reference_bodies(config: dict) -> dict:
    """The bodies a cuirass's neck ring is checked against, by sex and weight.

    Both weights, because both are shipped: the GLB carries ``_1`` geometry
    with ``_0`` as a morph target, and the runtime blends between them by the
    wearer's ``NAM7`` body weight exactly as Skyrim does. A ring that matches
    the maximum-weight neck and not the minimum-weight one is open on half the
    roster, which is the shape of the bug 0055 shipped.

    And both sexes, because a female neck ring measures 0.345-0.386 source
    units against the male 0.483-0.529. Checking a female piece against a male
    neck is how ten female builds shipped with a hole in them; a gate derived
    from the same reference as the fix cannot see its own defect.
    """
    profiles = config.get("bodies") or [config["body"]]
    out: dict = {}
    for body_id in profiles:
        body = json.loads((CONFIG / "bodies" / f"{body_id}.json").read_text())
        entry = next((m for m in body["meshes"] if m["name"] == "body"), None)
        if entry is None:
            raise ValueError(f"body profile {body_id} declares no 'body' mesh")
        mesh_file = entry["file"]
        if not mesh_file.endswith("_1.nif"):
            raise ValueError(f"body profile {body_id} declares no weight pair: {mesh_file}")
        stem = mesh_file[:-6]
        sex = "female" if "female" in body_id.lower() else "male"
        out.setdefault(sex, {
            "id": body_id,
            "meshes": {weight: f"{body['meshDir']}/{stem}_{weight}.nif"
                       for weight in ("0", "1")},
            "import": body["import"],
        })
    missing = [sex for sex in SEXES if sex not in out]
    if missing:
        raise ValueError(f"no reference body for {missing}; armour is built per sex")
    return out


def mesh_pair(archive, base: str) -> dict:
    """The ``_1`` mesh a piece ships as and the ``_0`` it morphs towards.

    Declared suffix-free in the config, resolved here against the archive.
    Almost every piece has the pair; a handful (both iron helmets, both orcish
    helmets) are authored as a single weight-independent mesh, and that is a
    piece with no morph target rather than an error.
    """
    paired = {weight: f"{base}_{weight}.nif" for weight in ("0", "1")}
    if archive.contains(paired["1"]):
        out = {"1": paired["1"]}
        if archive.contains(paired["0"]):
            out["0"] = paired["0"]
        return out
    single = f"{base}.nif"
    if archive.contains(single):
        return {"1": single}
    raise KeyError(f"neither {paired['1']} nor {single} is in the mesh archive")


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
        meshes = entry.get("meshes")
        if not isinstance(meshes, dict) or sorted(meshes) != sorted(SEXES):
            raise ValueError(
                f"{item_id}: 'meshes' must declare a base path for {list(SEXES)}. "
                "Bethesda uses four naming conventions for the male/female split, "
                "so the path is declared and never inferred (decision 0056).")
        items.append(dict(entry))
    missing = wanted - seen
    if missing:
        raise ValueError(f"unknown armour id(s): {sorted(missing)}")
    if not items:
        raise ValueError("no armour selected")
    return {"config": config, "items": items}


def assemble_data_root(set_id: str, items: list[dict], bodies: dict) -> Path:
    """Extract every mesh both sexes of every piece needs, plus the references.

    Each item gains ``builds``: one entry per sex, carrying the ``_1`` NIF the
    GLB ships as and the ``_0`` NIF it morphs towards.
    """
    work = BUILD_DIR / "armour" / set_id
    data_root = work / "data-root"
    if data_root.exists():
        shutil.rmtree(data_root)
    data_root.mkdir(parents=True, exist_ok=True)

    mesh_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / "Skyrim - Meshes.bsa")
    texture_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["textureBsa"])

    wanted: set[str] = set()
    unpaired = []
    for item in items:
        builds = {}
        for sex in SEXES:
            base = item["meshes"][sex]
            try:
                pair = mesh_pair(mesh_bsa, base)
            except KeyError as error:
                raise KeyError(f"{item['id']} ({sex}): {error}") from error
            mesh_bsa.extract(sorted(pair.values()), data_root)
            builds[sex] = {weight: data_root / nif for weight, nif in pair.items()}
            if "0" not in pair:
                unpaired.append(f"{item['id']}:{sex}")
            # Textures come off the shipped geometry; the morph source adds no
            # material of its own.
            wanted |= _referenced_textures(builds[sex]["1"])
        item["builds"] = builds

    for body in bodies.values():
        body["mesh_paths"] = {}
        for weight, mesh in body["meshes"].items():
            if not mesh_bsa.contains(mesh):
                raise KeyError(f"reference body {body['id']}: {mesh} not in the mesh archive")
            mesh_bsa.extract([mesh], data_root)
            body["mesh_paths"][weight] = data_root / mesh

    filled, absent = [], []
    for texture in sorted(wanted):
        if texture_bsa.contains(texture):
            texture_bsa.extract([texture], data_root)
            filled.append(texture)
        else:
            absent.append(texture)
    print(f"[armour] pieces={len(items)} builds={len(items) * len(SEXES)} "
          f"textures referenced={len(wanted)} filled={len(filled)} "
          f"unresolved={len(absent)}")
    if unpaired:
        print(f"[armour] no weight pair (single authored mesh, no morph target): "
              f"{sorted(unpaired)}")
    for texture in absent:
        print(f"[armour]   UNRESOLVED texture: {texture}")
    return work


def _ring_signature(ring: dict, weight: str) -> tuple | None:
    """A ring's shape, to the precision the build reports it in."""
    measured = (ring.get("weights") or {}).get(weight)
    if not measured:
        return None
    return (measured["vertices"], measured["ringRadius"], measured["ringHeight"])


def validate_neck_rings(jobs: list[dict], built: dict) -> None:
    """Reject an export whose neck opening belongs to somebody else.

    0055's gate asked whether the collar had landed on the reference polyline it
    had just been snapped to — a question derived from the fix, which is why it
    stayed green while every female build had a hole in it. So this one asserts
    only things the build cannot make true by construction, and each of the
    three is the signature of a defect that has actually shipped:

    1. **A ring that is a copy of a body's neck loop must be a copy of the
       wearer's own.** Most vanilla cuirasses embed the neck-bearing body part
       and copy its loop bit-for-bit, which measures 0-2e-6 away. If the ring
       lands on *a* reference that closely, it has to be the right one — the
       male iron cuirass on a female wearer lands on `male_1` to 1e-6 and sits
       0.244 off the neck it is worn on, and is refused.
    2. **The two sexes must not produce the same ring.** A female mesh in the
       male slot, or one path pasted into both, is the defect six shipped
       pieces had. Two sexes' necks are 0.12-0.22 units apart; identical rings
       mean one wearer is in the other's armour.
    3. **A declared weight pair must actually move.** A morph target that
       measures the same at both ends is not blending, so the piece stays at
       maximum weight on every wearer — the original bug, silently restored.

    Deliberately silent about a ring that is *none* of the four references: that
    is the piece's own authored opening (eight of the nine vanilla cuirasses
    close the neck that way), and no comparison against a body's neck ring says
    anything true about it — a neck tapers, so a wider ring higher up it fits
    perfectly well. Whether such an opening leaves a hole is a line of sight
    against a real wearer's skin, head included, which the reference body here
    does not have: that is measured on the shipped GLBs by
    `scripts/measure-neck-seam.py`.

    Every value below is measured by the Blender stage on the exported mesh.
    """
    failures = []
    rings = {job["id"]: (built.get(job["id"], {}) or {}).get("neckRing")
             for job in jobs}
    for job in jobs:
        if not job["close_neck_seam"]:
            continue
        label = f"{job['item_id']} ({job['sex']})"
        ring = rings[job["id"]]
        if not ring:
            failures.append(f"{label}: the build reported no neck-ring measurement")
            continue
        if ring.get("collar") == "none":
            print(f"[armour] {label}: no ring encircles the neck "
                  f"({len(ring.get('nearMisses', []))} near miss(es)); its authored "
                  "opening is the seam")
            continue

        weights = ring.get("weights") or {}
        for weight, measured in sorted(weights.items()):
            expected = f"{job['sex']}_{weight}"
            against = measured.get("against") or {}
            if not against:
                failures.append(f"{label} weight _{weight}: no reference comparison")
                continue
            copies = [name for name, gap in against.items()
                      if gap["max"] <= NECK_RING_ON_NECK]
            if copies and copies != [expected]:
                failures.append(
                    f"{label} weight _{weight}: its neck ring is a copy of "
                    f"{', '.join(copies)}, not {expected} "
                    f"(which it sits {against[expected]['max']} off); "
                    "this is the wrong mesh for this wearer")
            print(f"[armour] {label} _{weight}: "
                  + (f"embeds {expected}'s own neck loop" if copies == [expected]
                     else "authored opening")
                  + f"; ring {measured['ringRadius']} at height "
                  f"{measured['ringHeight']}, {measured['vertices']} verts, "
                  f"offset to {expected} {against[expected]['max']}")

        # 3. The weight pair has to move. Only where one was shipped: four
        # helmets are authored once and have no target, which is recorded.
        if ring.get("morphed") and len(weights) == 2:
            if _ring_signature(ring, "0") == _ring_signature(ring, "1"):
                failures.append(
                    f"{label}: its _0 and _1 neck rings are identical, so the morph "
                    "target is not blending and the piece stays at maximum weight")

    # 2. Across the pair of builds, not within one of them.
    by_item: dict[str, dict[str, dict]] = {}
    for job in jobs:
        if job["close_neck_seam"] and rings.get(job["id"]):
            by_item.setdefault(job["item_id"], {})[job["sex"]] = rings[job["id"]]
    for item_id, pair in sorted(by_item.items()):
        if sorted(pair) != sorted(SEXES):
            continue
        signatures = {sex: _ring_signature(ring, "1") for sex, ring in pair.items()}
        if signatures["male"] is not None and signatures["male"] == signatures["female"]:
            failures.append(
                f"{item_id}: the male and female builds have the same neck ring "
                f"{signatures['male']}; one sex is wearing the other's mesh")

    if failures:
        raise RuntimeError("armour neck rings invalid: " + "; ".join(failures))


def build(set_id: str = "armour", only: list[str] | None = None,
          render_icons: bool = True) -> dict:
    resolved = resolve_set(set_id, only)
    config, items = resolved["config"], resolved["items"]
    bodies = reference_bodies(config)
    work = assemble_data_root(set_id, items, bodies)

    rig = json.loads((CONFIG / "rigs" / f"{config['rig']}.json").read_text())
    body = json.loads((CONFIG / "bodies" / f"{config['body']}.json").read_text())
    # Only pieces that meet the head have a neck ring to check.
    seam_slots = {name for name, slot in config["slots"].items()
                  if slot["equipSlot"] == "chest"}
    output_dir = (ROOT / config["outputDir"]).resolve()
    icon_dir = (ROOT / config["iconDir"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    icon_dir.mkdir(parents=True, exist_ok=True)

    # One job per piece per sex. The icon is rendered once, off the male build:
    # it is an inventory thumbnail of an item, not a picture of a wearer.
    jobs = []
    for item in items:
        for sex in SEXES:
            pair = item["builds"][sex]
            jobs.append({
                "id": f"{item['id']}-{sex}",
                "item_id": item["id"],
                "sex": sex,
                "nif": to_windows(pair["1"]),
                "morph_nif": to_windows(pair["0"]) if "0" in pair else None,
                "close_neck_seam": item["slot"] in seam_slots,
                "output_glb": to_windows(output_dir / f"{item['id']}-{sex}.glb"),
                "icon_png": to_windows(icon_dir / f"{item['id']}.png")
                            if sex == "male" else None,
            })

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
            sex: {"id": entry["id"], "import": entry["import"],
                  "nifs": {weight: to_windows(path)
                           for weight, path in entry["mesh_paths"].items()}}
            for sex, entry in bodies.items()
        },
        "items": jobs,
        "summary_json": to_windows(summary_json),
    }, indent=2))

    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    print(f"[armour] launching headless build for {len(jobs)} build(s)...")
    proc = subprocess.run(
        [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
         "--background", "--python", to_windows(ARMOUR_SCRIPT)],
        env=env, capture_output=True, text=True,
        timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900) + 30 * len(jobs),
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
    missing = [job["id"] for job in jobs if job["id"] not in built]
    if missing:
        raise RuntimeError(f"builds missing from the batch: {missing}")
    validate_neck_rings(jobs, built)

    if only is None:
        write_manifest(set_id, config, items, built)
    else:
        print(f"[armour] partial build ({len(items)} piece(s)); manifest left alone")
    return summary


def write_manifest(set_id: str, config: dict, items: list[dict], built: dict) -> None:
    """The runtime contract: one asset per sex, and what the piece covers.

    Coverage is read out of the NIF rather than declared, and it is recorded
    **per sex**, because Bethesda's two halves are not always cut the same: the
    male steel cuirass takes the forearms (biped slot 38) and the female one
    does not. Publishing the male figure for both would hide a body mesh that
    nothing replaces, and a woman in steel would lose her forearms.
    """
    manifest = {
        # Standard 3. Version 1 was the unversioned, male-only manifest whose
        # single `asset` every wearer loaded; a runtime that reads one as if it
        # were this would dress every woman in a man's armour.
        "schemaVersion": 2,
        "set": set_id,
        "slots": config["slots"],
        "items": {},
    }
    for item in items:
        builds = {sex: built[f"{item['id']}-{sex}"] for sex in SEXES}
        manifest["items"][item["id"]] = {
            "slot": item["slot"],
            "material": item["material"],
            "assets": {
                sex: f"{Path(config['outputDir']).name}/{item['id']}-{sex}.glb"
                for sex in SEXES
            },
            # Standard 6 and decision 0052: the deployed binary is checked
            # against the manifest that describes it. A GLB that half-copied,
            # or a manifest describing a build that was never installed, is a
            # wearer with a hole in them and no error anywhere.
            "sha256": {
                sex: hashlib.sha256(
                    (ROOT / config["outputDir"] / f"{item['id']}-{sex}.glb").read_bytes()
                ).hexdigest()
                for sex in SEXES
            },
            "icon": f"{Path(config['iconDir']).name}/{item['id']}.png",
            "coversBipedSlots": {
                sex: entry["coversBipedSlots"] for sex, entry in builds.items()
            },
            # The inventory's own figure: how big the item is, which is one
            # item however many ways it is cut. The male build supplies it.
            "sizeMeters": builds["male"]["sizeMeters"],
        }
    manifest_path = (ROOT / config["manifestOutput"]).resolve()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"[armour] manifest -> {manifest_path}")


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
