"""Build every playable character build against one shared rig.

Ten races on two sexes (decision 0054). What gets built is their product: a
**build**, id `<race>-<sex>`, because that is the granularity at which a GLB
exists. The race itself is lore — label and description — and lives in
`config/skyrim-playable-races.json` with no assets on it at all.

Animations and skinned bodies are separable products of the same build. A rig
GLB carries the skeleton and the semantic clips every character shares; a build
GLB carries only that build's meshes and textures. Shipping them together would
duplicate roughly three megabytes of authored animation twenty times over.

A reference build is built in full: it is the only one that needs the
animations imported, because the support envelopes and the fitted hurtbox are
measured from posed, skinned geometry. There is one reference per **sex**,
because female bodies, hands and feet are different meshes. The rig GLB and its
clips are still emitted once, by the male reference: the skeleton is shared and
the clips are sex-agnostic.

Usage:
    python -m pipeline.build_races
    python -m pipeline.build_races --only nord-male khajiit-female
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

from .build import (
    assemble_animations,
    assemble_auxiliary_animations,
    assemble_data_root,
    run_blender,
    write_blender_plan,
    write_runtime_manifest,
)
from .models import CONFIG, CORE_ANIMATION_PACK, ROOT, load_races, resolve_character
from .npc_records import PLAYABLE_RACES, load_races as load_race_records


def _load_roster(roster_id: str) -> dict:
    return json.loads((CONFIG / "characters" / f"{roster_id}.json").read_text())


def _appearance(build_id: str) -> dict:
    return json.loads((CONFIG / "appearances" / f"{build_id}.json").read_text())


#: Our race id -> the Skyrim RACE editor id its body scale is read from. The
#: pipeline's own race order and Skyrim's PLAYABLE_RACES order are the same
#: list, so pairing them here keeps one table instead of two.
RACE_RECORD_IDS = dict(zip(
    ["nord", "imperial", "breton", "redguard", "altmer",
     "bosmer", "dunmer", "orsimer", "khajiit", "argonian"],
    PLAYABLE_RACES,
))


def height_scales() -> dict[str, dict[str, float]]:
    """Every race's height multiplier, per sex, read from the RACE record.

    Skyrim's RACE ``DATA`` stores a male and a female height; a Nord woman is
    not a Nord man scaled by the male one. Reading both here is why this is not
    transcribed into the appearance configs (decision 0054).
    """
    records = load_race_records()
    return {
        # Rounded: the record stores float32, so an exact 0.98 reads back as
        # 0.9800000190734863 and every roster diff carries the noise.
        race: {"male": round(records[record].maleHeight, 6),
               "female": round(records[record].femaleHeight, 6)}
        for race, record in RACE_RECORD_IDS.items()
    }


def pack_asset_path(rig_output: str, pack_id: str) -> str:
    """Where one animation pack's GLB lands, next to the core rig.

    Derived rather than configured: the core rig's path is already declared by
    the roster, and having a second place name the same directory is how a pack
    ends up shipped somewhere the game does not look for it.
    """
    rig = Path(rig_output)
    if pack_id == CORE_ANIMATION_PACK:
        return str(rig)
    return str(rig.with_suffix("")) + f".{pack_id}.glb"


def validate_facegen_summary(race_id: str, summary: dict) -> None:
    """Reject an export that can regress to a detached or untinted head.

    The Blender process is the only place that can inspect the assembled mesh,
    so its measured seam and material facts are part of the build contract.
    Keeping the check here makes every full or partial race build enforce it.
    """
    registration = summary.get("faceGenRegistration", {})
    seam = summary.get("faceGenNeckSeam", {})
    tint_bakes = summary.get("faceGenTintBakes", [])
    failures = []
    if registration.get("registrationVertices", 0) < 800:
        failures.append("full-surface FaceGen registration is missing")
    if seam.get("headVertices", 0) < 8 or seam.get("bodyVertices", 0) < 8:
        failures.append("head/body neck loops were not stitched")
    if seam.get("maxDistanceAfter", float("inf")) > 1e-5:
        failures.append("head/body neck seam remains open")
    if not any("head" in bake.get("mesh", "").lower() for bake in tint_bakes):
        failures.append("FaceTint was not baked into the exported head")
    brows = set(summary.get("browMeshes", []))
    hair = set(summary.get("hairMeshes", []))
    if not brows.issubset(hair):
        failures.append("brows were not classified as HairTint head parts")
    alpha = summary.get("headPartAlphaModes", {})
    if alpha.get("materials") and alpha.get("masked") != len(alpha["materials"]):
        failures.append("one or more HairTint head parts are not alpha-tested")
    if failures:
        raise RuntimeError(f"{race_id} FaceGen export invalid: {'; '.join(failures)}")


def set_head_part_alpha_modes(glb: Path, summary: dict) -> dict:
    """Make Skyrim's translucent head-part cards alpha-tested cutouts.

    Brows, hair, hairlines, beards and feathers carry authored alpha, but
    Blender 4 maps its remaining hashed surface mode to glTF ``BLEND``.
    Skyrim renders these cards with an alpha threshold.  Resolve the material
    indices through the exported node/mesh graph so this stays correct for any
    race-valid head part and does not depend on an editor-ID naming pattern.
    """
    data = bytearray(glb.read_bytes())
    magic, _version, _length = struct.unpack_from("<4sII", data, 0)
    chunk_length, chunk_type = struct.unpack_from("<I4s", data, 12)
    if magic != b"glTF" or chunk_type != b"JSON":
        raise ValueError(f"{glb} is not a GLB with a leading JSON chunk")
    start = 20
    gltf = json.loads(bytes(data[start:start + chunk_length]))

    head_parts = set(summary.get("hairMeshes", []))
    material_indices = set()
    for node in gltf.get("nodes", []):
        if node.get("name") not in head_parts or "mesh" not in node:
            continue
        mesh = gltf.get("meshes", [])[node["mesh"]]
        material_indices.update(
            primitive["material"]
            for primitive in mesh.get("primitives", [])
            if "material" in primitive
        )

    materials = gltf.get("materials", [])
    for index in material_indices:
        materials[index]["alphaMode"] = "MASK"
        materials[index]["alphaCutoff"] = 0.5

    encoded = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    encoded += b" " * (-len(encoded) % 4)
    rebuilt = bytearray(data[:12])
    rebuilt += struct.pack("<I4s", len(encoded), b"JSON") + encoded
    rebuilt += data[start + chunk_length:]
    struct.pack_into("<I", rebuilt, 8, len(rebuilt))
    glb.write_bytes(bytes(rebuilt))

    result = {
        "materials": sorted(materials[index].get("name", "") for index in material_indices),
        "masked": len(material_indices),
        "alphaCutoff": 0.5,
    }
    print(f"[races] {glb.stem}: {len(material_indices)} HairTint material(s) alpha-tested")
    return result


def build_race(roster: dict, build_id: str, *, reference: bool, emit_rig: bool) -> dict:
    """Build one character build, and on the rig-emitting reference the rig too.

    ``reference`` imports the animations, because that is what the support
    envelopes and the fitted hurtbox are measured from — once per sex.
    ``emit_rig`` additionally writes the shared rig GLB and the runtime
    animation manifest, and is true only for the male reference: the skeleton
    and the clips are sex-agnostic, so a second copy would only be a second
    thing to keep in step.
    """
    race_glb = Path(roster["raceOutputDir"]) / f"{build_id}.glb"
    exports = [{"path": str(race_glb), "animations": False, "meshes": True}]
    overrides = {
        "id": f"{roster['id']}-{build_id}",
        "appearance": build_id,
        "exports": exports,
        "output": str(race_glb),
        "manifestOutput": roster["manifestOutput"],
    }
    if emit_rig:
        # The rig is emitted once per animation pack. Every pack repeats the
        # skeleton (cheap) and carries only its own clips, so a character that
        # never picks up a greatsword never downloads the greatsword moveset.
        probe = resolve_character(roster["id"], {**overrides, "exports": []})
        packs = probe.animation_packs or {CORE_ANIMATION_PACK: {}}
        for pack_id in packs:
            clips = [a.semantic for a in probe.animations if a.pack == pack_id]
            if not clips:
                raise ValueError(f"animation pack {pack_id!r} contains no clips")
            exports.append({
                "path": pack_asset_path(roster["rigOutput"], pack_id),
                "animations": True,
                "meshes": False,
                "actions": clips,
            })

    plan = resolve_character(roster["id"], overrides)
    plan.character_id = f"{roster['id']}-{build_id}"
    if not reference:
        # Only a reference build needs the clips: it is the one measuring
        # support envelopes.
        plan.animations = []

    data_root = assemble_data_root(plan)
    animations = assemble_animations(plan) if reference else {}
    auxiliary = assemble_auxiliary_animations(plan) if reference else {}
    blender_plan = write_blender_plan(plan, data_root, animations, auxiliary)
    summary = run_blender(blender_plan, (ROOT / race_glb).resolve())
    summary["headPartAlphaModes"] = set_head_part_alpha_modes(
        (ROOT / race_glb).resolve(), summary
    )
    validate_facegen_summary(build_id, summary)
    sex = _appearance(build_id)["sex"]
    if emit_rig:
        write_runtime_manifest(plan, summary, sex=sex)
    elif reference:
        # A reference build that does not emit the rig still measured its own
        # body. Merging its hurtbox is what stops a female character being hit
        # by the male silhouette's capsules.
        merge_hurtbox_for_sex((ROOT / roster["manifestOutput"]).resolve(), sex, summary)
    return summary


def build(
    roster_id: str = "skyrim-playable",
    only: list[str] | None = None,
    skip_reference: bool = False,
    reuse_rig: bool = False,
) -> dict:
    roster = _load_roster(roster_id)
    all_builds = list(roster["builds"])
    references = dict(roster.get("referenceBuilds") or {})
    rig_build = references.get("male")
    wanted = list(only or all_builds)
    unknown = [b for b in wanted if b not in all_builds]
    if unknown:
        raise ValueError(f"unknown build(s) for {roster_id}: {unknown}")
    # The rig-emitting build always goes first: it produces the rig and the
    # manifest everything else is validated against.
    ordered = ([rig_build] if rig_build else []) + [b for b in wanted if b != rig_build]
    if skip_reference or reuse_rig:
        # Reuse the rig and manifest while rebuilding any requested bodies,
        # including the build that normally emits the rig. The old branch
        # silently turned `--only dunmer --skip-reference` back into a full
        # 103-clip rig build precisely when a body-only fix most needed the
        # fast path.
        ordered = wanted
        print("[races] reusing the existing rig"
              + ("" if skip_reference else "; reference builds still import their clips"))
    elif only and rig_build and rig_build not in only:
        print(f"[races] including {rig_build}: the rig and manifest come from it")

    summaries = {}
    for build_id in ordered:
        print(f"[races] === {build_id} ===")
        summaries[build_id] = build_race(
            roster,
            build_id,
            reference=build_id in references.values() and not skip_reference,
            emit_rig=build_id == rig_build and not (skip_reference or reuse_rig),
        )

    roster_path = (ROOT / roster["rosterOutput"]).resolve()
    rig_glb = (ROOT / roster["rigOutput"]).resolve()
    races = load_races(roster["races"])
    heights = height_scales()
    manifest = {
        # Engineering standard 3. Version 1 hung assets off the race map and
        # knew nothing about sex; the runtime refuses to load one.
        "schemaVersion": 2,
        "roster": roster_id,
        "rig": {
            "asset": Path(roster["rigOutput"]).name,
            "sha256": hashlib.sha256(rig_glb.read_bytes()).hexdigest(),
        },
        "sexes": ["male", "female"],
        # Lore level: ten races, no assets. Label and description belong here
        # and not on a build, because "Nord" is one thing, not two.
        "races": races,
        "builds": {},
        "referenceBuilds": references,
    }
    if only and roster_path.exists():
        # A partial run updates the builds it built and leaves the rest alone.
        # Rebuilding twenty bodies to change one is not a workflow, and a roster
        # that silently forgets the nineteen you did not ask for is worse.
        previous = json.loads(roster_path.read_text())
        manifest["builds"] = dict(previous.get("builds", {}))

    for build_id in ordered:
        appearance = _appearance(build_id)
        race_id, sex = appearance["race"], appearance["sex"]
        asset = Path(roster["raceOutputDir"]) / f"{build_id}.glb"
        manifest["builds"][build_id] = {
            "id": build_id,
            "race": race_id,
            "sex": sex,
            "asset": f"{Path(roster['raceOutputDir']).name}/{build_id}.glb",
            "sha256": hashlib.sha256((ROOT / asset).read_bytes()).hexdigest(),
            # Which biped slot each body mesh occupies, so armour can hide what
            # it actually covers without a table of mesh names in game code.
            "meshBipedSlots": summaries[build_id].get("meshBipedSlots", {}),
            # Which body the build is made of (male, female-khajiit, ...), so a
            # second rig built per body — the first-person arms — can be
            # matched to the build without a table in game code.
            "body": appearance.get("body", "male"),
            # Skyrim's RACE record changes the whole actor's stature, and it
            # stores a height per sex. The runtime scales about the foot-rooted
            # actor origin, so this alters silhouette without lifting or
            # burying the feet.
            "heightScale": heights[race_id][sex],
            # QNAM is Skyrim's own NPC body-tint colour and HCLF supplies the
            # HairTint colour. Keep both live for first-person arms and a later
            # character creator; the fixed head already carries FaceTint.
            "appearance": {
                "skinTint": appearance.get("skinTint", [1, 1, 1]),
                "skinTintMode": "skyrim-rgb-tint",
                "hairTint": appearance.get("hairTint", [1, 1, 1]),
                "skinMeshes": summaries[build_id].get("skinMeshes", []),
                "hairMeshes": summaries[build_id].get("hairMeshes", []),
            },
            "faceGen": appearance.get("faceGen"),
        }
    # Keep the public roster stable regardless of whether the reference rig was
    # rebuilt or reused. UI display order should not change as a side effect of
    # choosing the fast body-only build path.
    manifest["builds"] = {
        b: manifest["builds"][b] for b in all_builds if b in manifest["builds"]
    }
    roster_path.parent.mkdir(parents=True, exist_ok=True)
    roster_path.write_text(json.dumps(manifest, indent=2))
    print(f"[races] roster -> {roster_path}")
    return summaries


def main() -> None:
    parser = argparse.ArgumentParser(description="Build every playable character build on one rig.")
    parser.add_argument("--roster", default="skyrim-playable")
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--skip-reference", action="store_true",
                        help="reuse the existing rig AND skip the clip import (fast body-only)")
    parser.add_argument("--reuse-rig", action="store_true",
                        help="reuse the existing rig, but still import clips for a reference "
                             "build so its support envelope and hurtbox are measured")
    args = parser.parse_args()
    build(args.roster, args.only, skip_reference=args.skip_reference,
          reuse_rig=args.reuse_rig)


if __name__ == "__main__":
    main()
