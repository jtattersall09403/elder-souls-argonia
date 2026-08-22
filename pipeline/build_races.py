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
from .models import CONFIG, ROOT, resolve_character


def _load_roster(roster_id: str) -> dict:
    return json.loads((CONFIG / "characters" / f"{roster_id}.json").read_text())


def _race_label(race_id: str) -> tuple[str, str]:
    race = json.loads((CONFIG / "races" / f"{race_id}.json").read_text())
    return race.get("label", race_id), race.get("description", "")


def build_race(roster: dict, race_id: str, *, reference: bool) -> dict:
    """Build one race, and on the reference race the shared rig as well."""
    race_glb = Path(roster["raceOutputDir"]) / f"{race_id}.glb"
    exports = [{"path": str(race_glb), "animations": False, "meshes": True}]
    if reference:
        exports.append({"path": roster["rigOutput"], "animations": True, "meshes": False})

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
    if reference:
        write_runtime_manifest(plan, summary)
    return summary


def build(roster_id: str = "skyrim-playable", only: list[str] | None = None) -> dict:
    roster = _load_roster(roster_id)
    reference = roster["referenceRace"]
    wanted = list(only or roster["races"])
    unknown = [race for race in wanted if race not in roster["races"]]
    if unknown:
        raise ValueError(f"unknown race(s) for {roster_id}: {unknown}")
    # The reference race always goes first: it produces the rig and the manifest
    # everything else is validated against.
    ordered = [reference] + [race for race in wanted if race != reference]
    if only and reference not in only:
        print(f"[races] including reference race {reference}: the rig and manifest come from it")

    summaries = {}
    for race_id in ordered:
        print(f"[races] === {race_id} ===")
        summaries[race_id] = build_race(roster, race_id, reference=race_id == reference)

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
    for race_id in ordered:
        label, description = _race_label(race_id)
        asset = Path(roster["raceOutputDir"]) / f"{race_id}.glb"
        manifest["races"][race_id] = {
            "label": label,
            "description": description,
            "asset": f"{Path(roster['raceOutputDir']).name}/{race_id}.glb",
            "sha256": hashlib.sha256((ROOT / asset).read_bytes()).hexdigest(),
        }
    roster_path.parent.mkdir(parents=True, exist_ok=True)
    roster_path.write_text(json.dumps(manifest, indent=2))
    print(f"[races] roster -> {roster_path}")
    return summaries


def main() -> None:
    parser = argparse.ArgumentParser(description="Build every playable race on one rig.")
    parser.add_argument("--roster", default="skyrim-playable")
    parser.add_argument("--only", nargs="*", default=None)
    args = parser.parse_args()
    build(args.roster, args.only)


if __name__ == "__main__":
    main()
