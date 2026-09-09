"""Build every playable race against one shared rig.

Animations and skinned bodies are separable products of the same build. A rig
GLB carries the skeleton and the 40 semantic clips every character shares; a
race GLB carries only that race's meshes and textures. Shipping them together
would duplicate roughly three megabytes of authored animation for every race
that exists, which is the wrong shape for a game that wants ten of them now and
more later.

The reference race is built first and in full: it is the only one that needs
the animations imported, because the support envelopes and the fitted hurtbox
are measured from posed, skinned geometry. Every playable race shares the same
body, hands and feet meshes, so the lowest visible surface those measurements
depend on is identical for all of them. That build emits both the rig GLB and
its own race GLB. The rest import meshes only, which is fast.

Usage:
    python -m pipeline.build_races
    python -m pipeline.build_races --only nord khajiit
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from .build import (
    assemble_animations,
    assemble_auxiliary_animations,
    assemble_data_root,
    run_blender,
    write_blender_plan,
    write_runtime_manifest,
)
from .models import CONFIG, CORE_ANIMATION_PACK, ROOT, resolve_character


def _load_roster(roster_id: str) -> dict:
    return json.loads((CONFIG / "characters" / f"{roster_id}.json").read_text())


def _race_config(race_id: str) -> dict:
    return json.loads((CONFIG / "races" / f"{race_id}.json").read_text())


def _race_label(race_id: str) -> tuple[str, str]:
    race = _race_config(race_id)
    return race.get("label", race_id), race.get("description", "")


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
    if failures:
        raise RuntimeError(f"{race_id} FaceGen export invalid: {'; '.join(failures)}")


def build_race(roster: dict, race_id: str, *, reference: bool) -> dict:
    """Build one race, and on the reference race the shared rig as well."""
    race_glb = Path(roster["raceOutputDir"]) / f"{race_id}.glb"
    exports = [{"path": str(race_glb), "animations": False, "meshes": True}]
    if reference:
        # The rig is emitted once per animation pack. Every pack repeats the
        # skeleton (cheap) and carries only its own clips, so a character that
        # never picks up a greatsword never downloads the greatsword moveset.
        probe = resolve_character(roster["id"], {
            "id": f"{roster['id']}-{race_id}",
            "race": race_id,
            "exports": [],
            "output": str(race_glb),
            "manifestOutput": roster["manifestOutput"],
        })
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

    plan = resolve_character(roster["id"], {
        "id": f"{roster['id']}-{race_id}",
        "race": race_id,
        "exports": exports,
        "output": str(race_glb),
        "manifestOutput": roster["manifestOutput"],
    })
    plan.character_id = f"{roster['id']}-{race_id}"
    if not reference:
        # Only the reference build needs the clips: it is the one measuring
        # support envelopes and emitting the shared rig.
        plan.animations = []

    data_root = assemble_data_root(plan)
    animations = assemble_animations(plan) if reference else {}
    auxiliary = assemble_auxiliary_animations(plan) if reference else {}
    blender_plan = write_blender_plan(plan, data_root, animations, auxiliary)
    summary = run_blender(blender_plan, (ROOT / race_glb).resolve())
    validate_facegen_summary(race_id, summary)
    if reference:
        write_runtime_manifest(plan, summary)
    return summary


def build(
    roster_id: str = "skyrim-playable",
    only: list[str] | None = None,
    skip_reference: bool = False,
) -> dict:
    roster = _load_roster(roster_id)
    reference = roster["referenceRace"]
    wanted = list(only or roster["races"])
    unknown = [race for race in wanted if race not in roster["races"]]
    if unknown:
        raise ValueError(f"unknown race(s) for {roster_id}: {unknown}")
    # The reference race always goes first: it produces the rig and the manifest
    # everything else is validated against.
    ordered = [reference] + [race for race in wanted if race != reference]
    if skip_reference:
        # Reuse the rig and manifest while rebuilding any requested bodies,
        # including the race that normally acts as the reference. The old
        # branch silently turned `--only dunmer --skip-reference` back into a
        # full 103-clip rig build precisely when a body-only fix most needed the
        # fast path.
        ordered = wanted
        print(f"[races] reusing the existing rig: body-only build")
    elif only and reference not in only:
        print(f"[races] including reference race {reference}: the rig and manifest come from it")

    summaries = {}
    for race_id in ordered:
        print(f"[races] === {race_id} ===")
        summaries[race_id] = build_race(
            roster,
            race_id,
            reference=race_id == reference and not skip_reference,
        )

    roster_path = (ROOT / roster["rosterOutput"]).resolve()
    rig_glb = (ROOT / roster["rigOutput"]).resolve()
    manifest = {
        "roster": roster_id,
        "rig": {
            "asset": Path(roster["rigOutput"]).name,
            "sha256": hashlib.sha256(rig_glb.read_bytes()).hexdigest(),
        },
        "referenceRace": reference,
        "races": {},
    }
    if only and roster_path.exists():
        # A partial run updates the races it built and leaves the rest alone.
        # Rebuilding ten races to change one is not a workflow, and a roster
        # that silently forgets the nine you did not ask for is worse.
        previous = json.loads(roster_path.read_text())
        manifest["races"] = dict(previous.get("races", {}))

    for race_id in ordered:
        label, description = _race_label(race_id)
        asset = Path(roster["raceOutputDir"]) / f"{race_id}.glb"
        manifest["races"][race_id] = {
            "label": label,
            "description": description,
            "asset": f"{Path(roster['raceOutputDir']).name}/{race_id}.glb",
            "sha256": hashlib.sha256((ROOT / asset).read_bytes()).hexdigest(),
            # Which biped slot each body mesh occupies, so armour can hide what
            # it actually covers without a table of mesh names in game code.
            "meshBipedSlots": summaries[race_id].get("meshBipedSlots", {}),
            # Which body the race is built on (male, male-argonian, ...), so a
            # second rig built per body — the first-person arms — can be
            # matched to the race without a table in game code.
            "body": _race_config(race_id).get("body", "male"),
            # Skyrim's RACE record changes the whole actor's stature. The
            # runtime scales about the foot-rooted actor origin, so this alters
            # silhouette without lifting or burying the feet.
            "heightScale": _race_config(race_id).get("heightScale", 1.0),
            # QNAM is Skyrim's own NPC body-tint colour and HCLF supplies the
            # HairTint colour. Keep both live for first-person arms and a later
            # character creator; the fixed head already carries FaceTint.
            "appearance": {
                "skinTint": _race_config(race_id).get("skinTint", [1, 1, 1]),
                "skinTintMode": "skyrim-rgb-tint",
                "hairTint": _race_config(race_id).get("hairTint", [1, 1, 1]),
                "skinMeshes": summaries[race_id].get("skinMeshes", []),
                "hairMeshes": summaries[race_id].get("hairMeshes", []),
            },
        }
    # Keep the public roster stable regardless of whether the reference rig was
    # rebuilt or reused. UI display order should not change as a side effect of
    # choosing the fast body-only build path.
    canonical_order = [reference] + [race for race in roster["races"] if race != reference]
    manifest["races"] = {
        race: manifest["races"][race]
        for race in canonical_order
        if race in manifest["races"]
    }
    roster_path.parent.mkdir(parents=True, exist_ok=True)
    roster_path.write_text(json.dumps(manifest, indent=2))
    print(f"[races] roster -> {roster_path}")
    return summaries


def main() -> None:
    parser = argparse.ArgumentParser(description="Build every playable race on one rig.")
    parser.add_argument("--roster", default="skyrim-playable")
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--skip-reference", action="store_true",
                        help="reuse the existing rig instead of rebuilding it")
    args = parser.parse_args()
    build(args.roster, args.only, skip_reference=args.skip_reference)


if __name__ == "__main__":
    main()
