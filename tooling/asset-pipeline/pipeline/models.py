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
import math
import os
from dataclasses import dataclass, field
from pathlib import Path

# Root for source archives, build intermediates and bulky outputs. The vault
# lives outside this repo (docs/decisions/0001): point ELDER_SOULS_ASSET_ROOT at
# a directory containing skyrim-source/, build/ and output/. Without it, paths
# resolve inside tooling/asset-pipeline/, which holds only tracked manifests.
_asset_root = os.environ.get("ELDER_SOULS_ASSET_ROOT")
ROOT = Path(_asset_root).expanduser().resolve() if _asset_root else Path(__file__).resolve().parent.parent
CONFIG = Path(__file__).resolve().parent / "config"
SUPPORT_MODES = frozenset({"airborne", "penetration", "floor-contact"})
#: The animation pack every actor always loads. Anything a character can do
#: without knowing what it is holding belongs here.
CORE_ANIMATION_PACK = "core"


def _load(kind: str, name: str) -> dict:
    return json.loads((CONFIG / kind / f"{name}.json").read_text())


@dataclass
class MeshSpec:
    name: str
    file: Path


@dataclass(frozen=True)
class QuaternionKeyRemoval:
    """One intentional removal from a bone's imported quaternion curve.

    ``source_time`` is on the *imported* HKX clock, before native retiming.
    """

    bone: str
    source_time: float


@dataclass(frozen=True)
class ExportedContinuityCheck:
    """The rendered result a removal must produce, on the *exported* clock.

    A removal cannot be proven by absence: the glTF exporter samples pose bones
    at the scene frame rate, so every interior instant still owns a key. What
    conditioning actually changes is the value the runtime slerps through, so
    this bounds the rendered angular step across the repaired window instead.
    """

    bone: str
    start_time: float
    end_time: float
    max_angular_step_degrees: float


@dataclass
class AnimationSpec:
    semantic: str
    source: str
    looping: bool
    root_motion: str
    playback_rate: float
    provenance: str
    cross_fade_duration: float = 0.12
    cross_fade_out_duration: float | None = None
    playback_start_time: float | None = None
    playback_end_time: float | None = None
    preserve_root_motion: bool = False
    #: With preserve_root_motion: subtract the planar mean of the root chain so
    #: a stationary loop shares the attack clips' origin (no slide on entry).
    recentre_root_motion: bool = False
    #: Opt out of the default "keep the authored vertical COM channel" policy.
    #: Only correct when the physics controller owns the clip's height.
    strip_vertical_root_motion: bool = False
    preserve_root_motion_axes: tuple[int, ...] = ()
    support_mode: str = "penetration"
    support_phases: tuple[dict, ...] = ()
    support_sample_rate: int = 30
    remove_quaternion_keys: tuple[QuaternionKeyRemoval, ...] = ()
    exported_continuity: tuple[ExportedContinuityCheck, ...] = ()
    #: Auxiliary-bone clip to merge into this action, by base filename. Defaults
    #: to this clip's own source name, because Skyrim authors the pair together.
    #: Explicitly null opts a clip out.
    tail_source: str | None = None
    #: Which downloadable animation pack this clip ships in. ``core`` is the
    #: always-loaded set (locomotion, reactions, death); every other pack is
    #: fetched only by an actor that can actually play it, so adding a weapon
    #: type costs nothing to a character that never equips one.
    pack: str = "core"
    extra: dict = field(default_factory=dict)


@dataclass
class BuildPlan:
    character_id: str
    # rig
    skeleton: Path
    expected_bones: int
    rig_import: dict
    #: Auxiliary bone chains grafted onto this rig (the beast tail), keyed by id.
    auxiliary_bones: dict
    mesh_dir: str
    #: Referenced texture path -> archive path to extract into it. How a race
    #: gets its own head normal, eyes or beast skin without a curated tree.
    texture_substitutions: dict
    #: Multiplied into every skin base colour. Skyrim tints rather than
    #: shipping a diffuse per race, and so do we.
    skin_tint: tuple[float, float, float]
    #: GLBs this build should emit. A rig carries the shared motion, a race
    #: carries only its own skin, and both is the single-file legacy shape.
    #: An export may also name ``actions``, restricting it to one pack's clips.
    exports: tuple[dict, ...]
    #: Ordered pack id -> emitted filename, from the animation config. The first
    #: entry is the core pack every actor loads.
    animation_packs: dict
    sockets: dict
    #: Quaternion XYZW from weapon-asset space into any socket bone's local
    #: space on this rig. A rig-level convention offset, never per weapon.
    socket_rotation: tuple[float, float, float, float]
    root_bone: str
    target_height: float
    # body + race geometry
    data_root: Path
    meshes: list[MeshSpec]
    mesh_import: dict
    # race
    morph: dict | None
    material_overrides: list[dict]
    # animations
    animations: list[AnimationSpec]
    anim_source_dir: str
    anim_local_overrides: dict
    scale_reference: dict
    support_calibration: dict
    # outputs
    output_glb: Path
    output_manifest: Path

    def to_json(self) -> dict:
        return {
            "character_id": self.character_id,
            "skeleton": str(self.skeleton),
            "expected_bones": self.expected_bones,
            "rig_import": self.rig_import,
            "auxiliary_bones": self.auxiliary_bones,
            "mesh_dir": self.mesh_dir,
            "texture_substitutions": self.texture_substitutions,
            "skin_tint": list(self.skin_tint),
            "exports": [dict(export) for export in self.exports],
            "animation_packs": dict(self.animation_packs),
            "sockets": self.sockets,
            "socket_rotation": list(self.socket_rotation),
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
                    "cross_fade_duration": a.cross_fade_duration,
                    "cross_fade_out_duration": a.cross_fade_out_duration,
                    "playback_start_time": a.playback_start_time,
                    "playback_end_time": a.playback_end_time,
                    "preserve_root_motion_axes": list(a.preserve_root_motion_axes),
                    "support_mode": a.support_mode,
                    "support_phases": list(a.support_phases),
                    "support_sample_rate": a.support_sample_rate,
                    "remove_quaternion_keys": [
                        {"bone": removal.bone, "source_time": removal.source_time}
                        for removal in a.remove_quaternion_keys
                    ],
                    "exported_continuity": [
                        {
                            "bone": check.bone,
                            "start_time": check.start_time,
                            "end_time": check.end_time,
                            "max_angular_step_degrees": check.max_angular_step_degrees,
                        }
                        for check in a.exported_continuity
                    ],
                    "provenance": a.provenance,
                    "pack": a.pack,
                }
                for a in self.animations
            ],
            "scale_reference": self.scale_reference,
            "support_calibration": self.support_calibration,
            "output_glb": str(self.output_glb),
            "output_manifest": str(self.output_manifest),
        }


def parse_socket_rotation(raw: object) -> tuple[float, float, float, float]:
    """Validate a rig's weapon-asset -> socket-bone quaternion (XYZW).

    This is a *rig convention*, resolved once per skeleton profile: weapon GLBs
    keep their native attach-node axes while the imported armature stores bones
    in Blender's convention, and the fixed rotation between those two frames is
    the same for every socket and every weapon. Missing means "already aligned".
    """
    if raw is None:
        return (0.0, 0.0, 0.0, 1.0)
    if (not isinstance(raw, list) or len(raw) != 4
            or any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in raw)):
        raise ValueError("rig socketRotation must be a quaternion array [x, y, z, w]")
    length = math.sqrt(sum(float(v) * float(v) for v in raw))
    if abs(length - 1.0) > 1e-4:
        raise ValueError(
            f"rig socketRotation must be unit length (got {length:.6f})"
        )
    return tuple(float(v) / length for v in raw)  # type: ignore[return-value]


def parse_curve_conditioning(
    semantic: str,
    raw: object,
) -> tuple[tuple[QuaternionKeyRemoval, ...], tuple[ExportedContinuityCheck, ...]]:
    """Validate the deliberately small, data-driven animation cleanup schema.

    The two halves deliberately use different clocks, because they describe
    different artefacts. ``removeQuaternionKeys[].sourceTime`` names an authored
    key on the *imported* HKX clock, which is what an audit of the source clip
    reports and what survives a change to the clip's native duration.
    ``exportedContinuity`` bounds the *rendered* result on the exported clip's
    clock, where one-shot Skyrim actions retain their frame-1 lead-in and match
    ``playbackStartTime`` and the glTF sampler times.
    """
    if raw is None:
        return (), ()
    if not isinstance(raw, dict):
        raise ValueError(f"{semantic}: curveConditioning must be an object")
    unknown = set(raw) - {"removeQuaternionKeys", "exportedContinuity"}
    if unknown:
        raise ValueError(
            f"{semantic}: curveConditioning has unsupported keys {sorted(unknown)}"
        )
    removals = raw.get("removeQuaternionKeys", [])
    if not isinstance(removals, list):
        raise ValueError(
            f"{semantic}: curveConditioning.removeQuaternionKeys must be an array"
        )

    resolved: list[QuaternionKeyRemoval] = []
    seen: set[tuple[str, float]] = set()
    for index, removal in enumerate(removals):
        label = f"{semantic}: curveConditioning.removeQuaternionKeys[{index}]"
        if not isinstance(removal, dict):
            raise ValueError(f"{label} must be an object")
        if set(removal) != {"bone", "sourceTime"}:
            raise ValueError(f"{label} must contain exactly bone and sourceTime")
        bone = removal.get("bone")
        source_time = removal.get("sourceTime")
        if not isinstance(bone, str) or not bone.strip():
            raise ValueError(f"{label}.bone must be a non-empty string")
        if (not isinstance(source_time, (int, float))
                or isinstance(source_time, bool)
                or not math.isfinite(source_time)
                or source_time < 0):
            raise ValueError(f"{label}.sourceTime must be a finite non-negative number")
        key = (bone, float(source_time))
        if key in seen:
            raise ValueError(f"{label} duplicates {bone!r} at {float(source_time):.7f}s")
        seen.add(key)
        resolved.append(QuaternionKeyRemoval(*key))

    checks = parse_exported_continuity(semantic, raw.get("exportedContinuity"))
    conditioned_bones = {removal.bone for removal in resolved}
    if resolved and not checks:
        raise ValueError(
            f"{semantic}: curveConditioning.removeQuaternionKeys needs a matching "
            "exportedContinuity entry; removal is only provable in the render"
        )
    for check in checks:
        if check.bone not in conditioned_bones:
            raise ValueError(
                f"{semantic}: curveConditioning.exportedContinuity names "
                f"unconditioned bone {check.bone!r}"
            )
    return tuple(resolved), checks


def parse_exported_continuity(
    semantic: str,
    raw: object,
) -> tuple[ExportedContinuityCheck, ...]:
    """Validate the rendered-result half of ``curveConditioning``."""
    if raw is None:
        return ()
    if not isinstance(raw, list):
        raise ValueError(
            f"{semantic}: curveConditioning.exportedContinuity must be an array"
        )
    fields = {"bone", "startTime", "endTime", "maxAngularStepDegrees"}
    checks: list[ExportedContinuityCheck] = []
    for index, entry in enumerate(raw):
        label = f"{semantic}: curveConditioning.exportedContinuity[{index}]"
        if not isinstance(entry, dict):
            raise ValueError(f"{label} must be an object")
        if set(entry) != fields:
            raise ValueError(f"{label} must contain exactly {sorted(fields)}")
        bone = entry["bone"]
        if not isinstance(bone, str) or not bone.strip():
            raise ValueError(f"{label}.bone must be a non-empty string")
        numbers = {}
        for name in ("startTime", "endTime", "maxAngularStepDegrees"):
            value = entry[name]
            if (not isinstance(value, (int, float)) or isinstance(value, bool)
                    or not math.isfinite(value) or value < 0):
                raise ValueError(f"{label}.{name} must be a finite non-negative number")
            numbers[name] = float(value)
        if numbers["endTime"] <= numbers["startTime"]:
            raise ValueError(f"{label}.endTime must be after startTime")
        if numbers["maxAngularStepDegrees"] <= 0:
            raise ValueError(f"{label}.maxAngularStepDegrees must be positive")
        checks.append(ExportedContinuityCheck(bone, **{
            "start_time": numbers["startTime"],
            "end_time": numbers["endTime"],
            "max_angular_step_degrees": numbers["maxAngularStepDegrees"],
        }))
    return tuple(checks)


def parse_skin_tint(raw: object) -> tuple[float, float, float]:
    if raw is None:
        return (1.0, 1.0, 1.0)
    if (not isinstance(raw, list) or len(raw) != 3
            or any(isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0 or v > 2
                   for v in raw)):
        raise ValueError("skinTint must be three numbers between 0 and 2")
    return tuple(float(v) for v in raw)  # type: ignore[return-value]


def resolve_character(character_id: str, overrides: dict | None = None) -> BuildPlan:
    """Resolve a character config, optionally overriding the race and outputs.

    The override hook is what lets one roster build ten races without ten
    near-identical character files.
    """
    char = dict(_load("characters", character_id))
    char.update(overrides or {})
    race = _load("races", char["race"])
    body = _load("bodies", char.get("body") or race.get("body", "male"))
    rig = _load("rigs", char["rig"])
    anim = _load("animations", char["animations"])

    # A race with no curated tree is assembled from the archives at build time,
    # which is the only version of this that scales past a handful of races.
    data_root = (
        (ROOT / race["dataRoot"]).resolve() if race.get("dataRoot")
        else ROOT / "build" / char["id"] / "data-root"
    )
    mesh_dir = body["meshDir"]
    meshes = [
        MeshSpec(m["name"], data_root / mesh_dir / m["file"]) for m in body["meshes"]
    ]
    # Hair, horns and beards are the race's, not the body's: they are skinned to
    # the same head bone the face is, so they ride along in the race GLB rather
    # than needing a mount of their own. Paths are archive-relative like every
    # other mesh, so the data-root assembler extracts them and their textures.
    for extra in race.get("extraMeshes", []):
        meshes.append(MeshSpec(extra["name"], data_root / extra["file"]))

    morph = dict(race["morph"]) if race.get("morph") else None
    if morph:
        morph["tri"] = str((ROOT / morph["tri"]).resolve())

    defaults = anim.get("defaults", {})
    support_calibration = anim.get("supportCalibration", {})
    if not isinstance(support_calibration, dict):
        raise ValueError("supportCalibration must be an object")
    cross_fade_sole_margin = support_calibration.get(
        "crossFadeSoleSafetyMarginMeters",
        0,
    )
    if (not isinstance(cross_fade_sole_margin, (int, float))
            or isinstance(cross_fade_sole_margin, bool)
            or cross_fade_sole_margin < 0
            or cross_fade_sole_margin > 0.1):
        raise ValueError(
            "supportCalibration.crossFadeSoleSafetyMarginMeters must be between 0 and 0.1"
        )
    airborne_impact_proximity = support_calibration.get(
        "airborneImpactProximityMeters",
        0,
    )
    if (not isinstance(airborne_impact_proximity, (int, float))
            or isinstance(airborne_impact_proximity, bool)
            or airborne_impact_proximity < 0
            or airborne_impact_proximity > 0.1):
        raise ValueError(
            "supportCalibration.airborneImpactProximityMeters must be between 0 and 0.1"
        )
    # Animation packs: separately downloadable slices of the same rig build.
    # Declared here rather than inferred, so a pack that no clip is assigned to
    # yet is still a visible, reviewable part of the contract.
    animation_packs = dict(anim.get("packs") or {})
    if animation_packs:
        if CORE_ANIMATION_PACK not in animation_packs:
            raise ValueError(
                f"animation packs must include the always-loaded "
                f"'{CORE_ANIMATION_PACK}' pack"
            )
        for pack_id, pack in animation_packs.items():
            if not isinstance(pack, dict) or not isinstance(pack.get("description"), str):
                raise ValueError(
                    f"animation pack {pack_id!r} needs a string 'description' "
                    "saying which actors need it"
                )

    animations: list[AnimationSpec] = []
    for semantic, entry in anim["animations"].items():
        pack = entry.get("pack", CORE_ANIMATION_PACK)
        if animation_packs and pack not in animation_packs:
            raise ValueError(
                f"{semantic}: pack {pack!r} is not declared in the config's 'packs'"
            )
        if entry.get("recentreRootMotion", False) and not entry.get("preserveRootMotion", False):
            raise ValueError(f"{semantic}: recentreRootMotion requires preserveRootMotion")
        explicit_axes = entry.get("preserveRootMotionAxes")
        if explicit_axes is not None:
            if entry.get("stripVerticalRootMotion", False):
                raise ValueError(
                    f"{semantic}: use preserveRootMotionAxes or "
                    "stripVerticalRootMotion, not both"
                )
            if (not isinstance(explicit_axes, list)
                    or any(type(axis) is not int or axis not in {0, 1, 2}
                           for axis in explicit_axes)
                    or len(set(explicit_axes)) != len(explicit_axes)):
                raise ValueError(
                    f"{semantic}: preserveRootMotionAxes must contain unique local axes 0, 1, or 2"
                )
        support_mode = entry.get(
            "supportMode",
            defaults.get("supportMode", "penetration"),
        )
        if support_mode not in SUPPORT_MODES:
            raise ValueError(
                f"{semantic}: supportMode must be one of {sorted(SUPPORT_MODES)}"
            )
        support_sample_rate = entry.get(
            "supportSampleRate",
            defaults.get("supportSampleRate", 30),
        )
        if (type(support_sample_rate) is not int
                or support_sample_rate < 30
                or support_sample_rate > 240
                or support_sample_rate % 30 != 0):
            raise ValueError(
                f"{semantic}: supportSampleRate must be a multiple of 30 "
                "between 30 and 240"
            )
        cross_fade_duration = entry.get(
            "crossFadeDuration",
            defaults.get("crossFadeDuration", 0.12),
        )
        if (not isinstance(cross_fade_duration, (int, float))
                or isinstance(cross_fade_duration, bool)
                or cross_fade_duration < 0):
            raise ValueError(
                f"{semantic}: crossFadeDuration must be a non-negative number"
            )
        cross_fade_out_duration = entry.get("crossFadeOutDuration")
        if (cross_fade_out_duration is not None
                and (not isinstance(cross_fade_out_duration, (int, float))
                     or isinstance(cross_fade_out_duration, bool)
                     or cross_fade_out_duration < 0)):
            raise ValueError(
                f"{semantic}: crossFadeOutDuration must be null or a non-negative number"
            )
        raw_support_phases = entry.get("supportPhases", [])
        if not isinstance(raw_support_phases, list):
            raise ValueError(f"{semantic}: supportPhases must be an array")
        support_phases: list[dict] = []
        previous_end = -1.0
        for index, phase in enumerate(raw_support_phases):
            if not isinstance(phase, dict):
                raise ValueError(f"{semantic}: supportPhases[{index}] must be an object")
            start = phase.get("startTime")
            end = phase.get("endTime")
            mode = phase.get("mode")
            if (not isinstance(start, (int, float)) or isinstance(start, bool)
                    or not isinstance(end, (int, float)) or isinstance(end, bool)
                    or start < 0 or end <= start):
                raise ValueError(
                    f"{semantic}: supportPhases[{index}] needs 0 <= startTime < endTime"
                )
            if start < previous_end:
                raise ValueError(f"{semantic}: supportPhases must not overlap")
            if mode not in SUPPORT_MODES:
                raise ValueError(
                    f"{semantic}: supportPhases[{index}].mode must be one of "
                    f"{sorted(SUPPORT_MODES)}"
                )
            support_phases.append({
                "startTime": float(start),
                "endTime": float(end),
                "mode": mode,
            })
            previous_end = float(end)
        remove_quaternion_keys, exported_continuity = parse_curve_conditioning(
            semantic,
            entry.get("curveConditioning"),
        )
        animations.append(
            AnimationSpec(
                semantic=semantic,
                source=entry["source"],
                looping=entry.get("looping", defaults.get("looping", False)),
                root_motion=entry.get("rootMotion", defaults.get("rootMotion", "strip")),
                playback_rate=entry.get("playbackRate", defaults.get("playbackRate", 1.0)),
                cross_fade_duration=float(cross_fade_duration),
                cross_fade_out_duration=(
                    None if cross_fade_out_duration is None
                    else float(cross_fade_out_duration)
                ),
                playback_start_time=entry.get("playbackStartTime"),
                playback_end_time=entry.get("playbackEndTime"),
                provenance=entry.get("provenance", ""),
                tail_source=(
                    entry["tailSource"] if "tailSource" in entry
                    else entry["source"].split("/")[-1]
                ),
                preserve_root_motion=entry.get("preserveRootMotion", False),
                recentre_root_motion=entry.get("recentreRootMotion", False),
                strip_vertical_root_motion=entry.get("stripVerticalRootMotion", False),
                preserve_root_motion_axes=tuple(explicit_axes or ()),
                support_mode=support_mode,
                support_phases=tuple(support_phases),
                pack=pack,
                support_sample_rate=support_sample_rate,
                remove_quaternion_keys=remove_quaternion_keys,
                exported_continuity=exported_continuity,
                extra={k: v for k, v in entry.items()
                       if k not in {"source", "looping", "rootMotion", "playbackRate", "crossFadeDuration", "crossFadeOutDuration", "playbackStartTime", "playbackEndTime", "provenance", "preserveRootMotion", "stripVerticalRootMotion", "preserveRootMotionAxes", "tailSource", "pack", "supportMode", "supportPhases", "supportSampleRate", "curveConditioning"}},
            )
        )

    return BuildPlan(
        character_id=char["id"],
        skeleton=(ROOT / rig["skeleton"]).resolve(),
        expected_bones=rig["expectedBones"],
        rig_import=rig["import"],
        auxiliary_bones={
            aux_id: {**aux, "skeleton": str((ROOT / aux["skeleton"]).resolve())}
            for aux_id, aux in rig.get("auxiliaryBones", {}).items()
        },
        sockets=rig["sockets"],
        socket_rotation=parse_socket_rotation(rig.get("socketRotation")),
        root_bone=rig["rootBone"],
        target_height=rig.get("targetHeightMeters", 1.85),
        data_root=data_root,
        mesh_dir=mesh_dir,
        texture_substitutions=dict(race.get("textureSubstitutions", {})),
        skin_tint=parse_skin_tint(race.get("skinTint")),
        exports=tuple(char.get("exports", ())),
        animation_packs=animation_packs,
        meshes=meshes,
        mesh_import=body["import"],
        morph=morph,
        material_overrides=race.get("materialOverrides", []),
        animations=animations,
        anim_source_dir=anim["sourceDir"],
        anim_local_overrides={
            k: str((ROOT / v).resolve()) for k, v in anim.get("localOverrides", {}).items()
        },
        scale_reference=anim.get("scaleReference", {}),
        support_calibration={
            "airborneImpactProximityMeters": float(airborne_impact_proximity),
            "crossFadeSoleSafetyMarginMeters": float(cross_fade_sole_margin),
        },
        output_glb=(ROOT / char["output"]).resolve(),
        output_manifest=(ROOT / char["manifestOutput"]).resolve(),
    )
