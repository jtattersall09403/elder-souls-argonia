"""Load and resolve the declarative character configs into a flat build plan.

The config tree is intentionally split into orthogonal profiles so that adding a
new humanoid race is *data*, not code:

    characters/<id>.json  ->  race + body + rig + animations
    races/<id>.json       ->  data root, head morph, material overrides
    bodies/<id>.json      ->  shared humanoid mesh set
    rigs/<id>.json        ->  skeleton + sockets + import settings
    animations/<id>.json  ->  semantic animation manifest

`resolve_character` returns a `BuildPlan` with absolute host paths only; the
Wine/Blender boundary (path translation) is handled later in build.py.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = Path(__file__).resolve().parent / "config"


def _load(kind: str, name: str) -> dict:
    return json.loads((CONFIG / kind / f"{name}.json").read_text())


@dataclass
class MeshSpec:
    name: str
    file: Path


@dataclass
class AnimationSpec:
    semantic: str
    source: str
    looping: bool
    root_motion: str
    playback_rate: float
    provenance: str
    extra: dict = field(default_factory=dict)


@dataclass
class BuildPlan:
    character_id: str
    # rig
    skeleton: Path
    expected_bones: int
    rig_import: dict
    sockets: dict
    root_bone: str
    target_height: float
    # body + race geometry
    data_root: Path
    meshes: list[MeshSpec]
    mesh_import: dict
    # race
    morph: dict
    material_overrides: list[dict]
    # animations
    animations: list[AnimationSpec]
    anim_source_dir: str
    anim_local_overrides: dict
    # outputs
    output_glb: Path
    output_manifest: Path

    def to_json(self) -> dict:
        return {
            "character_id": self.character_id,
            "skeleton": str(self.skeleton),
            "expected_bones": self.expected_bones,
            "rig_import": self.rig_import,
            "sockets": self.sockets,
            "root_bone": self.root_bone,
            "data_root": str(self.data_root),
            "meshes": [{"name": m.name, "file": str(m.file)} for m in self.meshes],
            "mesh_import": self.mesh_import,
            "morph": self.morph,
            "material_overrides": self.material_overrides,
            "animations": [
                {
                    "semantic": a.semantic,
                    "source": a.source,
                    "looping": a.looping,
                    "root_motion": a.root_motion,
                    "playback_rate": a.playback_rate,
                    "provenance": a.provenance,
                }
                for a in self.animations
            ],
            "output_glb": str(self.output_glb),
            "output_manifest": str(self.output_manifest),
        }


def resolve_character(character_id: str) -> BuildPlan:
    char = _load("characters", character_id)
    race = _load("races", char["race"])
    body = _load("bodies", char["body"])
    rig = _load("rigs", char["rig"])
    anim = _load("animations", char["animations"])

    data_root = (ROOT / race["dataRoot"]).resolve()
    mesh_dir = body["meshDir"]
    meshes = [
        MeshSpec(m["name"], data_root / mesh_dir / m["file"]) for m in body["meshes"]
    ]

    morph = dict(race["morph"])
    morph["tri"] = str((ROOT / morph["tri"]).resolve())

    defaults = anim.get("defaults", {})
    animations: list[AnimationSpec] = []
    for semantic, entry in anim["animations"].items():
        animations.append(
            AnimationSpec(
                semantic=semantic,
                source=entry["source"],
                looping=entry.get("looping", defaults.get("looping", False)),
                root_motion=entry.get("rootMotion", defaults.get("rootMotion", "strip")),
                playback_rate=entry.get("playbackRate", defaults.get("playbackRate", 1.0)),
                provenance=entry.get("provenance", ""),
                extra={k: v for k, v in entry.items()
                       if k not in {"source", "looping", "rootMotion", "playbackRate", "provenance"}},
            )
        )

    return BuildPlan(
        character_id=char["id"],
        skeleton=(ROOT / rig["skeleton"]).resolve(),
        expected_bones=rig["expectedBones"],
        rig_import=rig["import"],
        sockets=rig["sockets"],
        root_bone=rig["rootBone"],
        target_height=rig.get("targetHeightMeters", 1.85),
        data_root=data_root,
        meshes=meshes,
        mesh_import=body["import"],
        morph=morph,
        material_overrides=race.get("materialOverrides", []),
        animations=animations,
        anim_source_dir=anim["sourceDir"],
        anim_local_overrides={
            k: str((ROOT / v).resolve()) for k, v in anim.get("localOverrides", {}).items()
        },
        output_glb=(ROOT / char["output"]).resolve(),
        output_manifest=(ROOT / char["manifestOutput"]).resolve(),
    )
