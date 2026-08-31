"""Host-side build orchestrator for a game-ready character GLB.

Runs on the Linux host (any Python 3.10+, no third-party deps) and:

  1. resolves the declarative character config into a flat BuildPlan;
  2. assembles a deterministic build data-root (curated race tree + every
     NIF-referenced texture filled from Skyrim - Textures.bsa, without
     overwriting the race's own overrides);
  3. extracts the manifest's animation HKX from Skyrim - Animations.bsa;
  4. hands a resolved, path-translated plan to headless Wine/Blender + PyNifly;
  5. validates the emitted GLB and writes the runtime animation manifest.

Bethesda source data never leaves the local machine: the data-root and the
emitted GLB live under gitignored build/ and output/ paths.

Usage:
    python -m pipeline.build --character dunmer-combat
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from .bsa import BSAArchive
from .models import ROOT, BuildPlan, resolve_character

BLENDER_SCRIPT = Path(__file__).resolve().parent / "blender" / "build_character.py"
TOOLCHAIN = json.loads((Path(__file__).resolve().parent / "config" / "toolchain.json").read_text())
BUILD_DIR = ROOT / "build"

_TEXTURE_REF = re.compile(rb"textures\\[^\x00]{3,160}?\.dds", re.IGNORECASE)


def _expand(path: str) -> Path:
    return Path(os.path.expanduser(path))


def to_windows(path: Path) -> str:
    """Translate an absolute host path to its Wine Z: drive equivalent."""
    return "Z:" + str(path).replace("/", "\\")


def _portable_source_path(source: Path) -> Path:
    """Resolve a curated source path, rebasing stale workspace symlinks."""
    if not (source.is_symlink() and not source.exists()):
        return source
    target = Path(os.readlink(source))
    parts = target.parts
    try:
        source_index = parts.index("skyrim-source")
    except ValueError:
        return source
    rebased = ROOT.joinpath(*parts[source_index:])
    return rebased if rebased.exists() else source


def _copy_curated_file(src: str, dst: str, *, follow_symlinks: bool = True) -> str:
    """Copy one curated source file, rebasing stale workspace symlinks.

    The owned source tree is intentionally assembled from symlinks so the same
    mesh/texture is not duplicated for every race. Older trees used absolute
    links rooted at ``.../skyrim-source``; moving the two repositories together
    made those links dangle even though the target still exists below this
    checkout. Rebase only that known source-tree suffix and otherwise retain
    shutil's normal failure for a genuinely missing asset.
    """
    source = _portable_source_path(Path(src))
    return shutil.copy2(source, dst, follow_symlinks=follow_symlinks)


# ---------------------------------------------------------------------------
# Data-root assembly
# ---------------------------------------------------------------------------

def _referenced_textures(nif: Path) -> set[str]:
    data = nif.read_bytes()
    return {
        m.group(0).decode("latin1").replace("\\", "/").lower()
        for m in _TEXTURE_REF.finditer(data)
    }


def assemble_data_root(plan: BuildPlan) -> Path:
    """Build the race's data-root, then fill missing NIF textures from the BSA.

    A race may name a curated tree, but it does not have to: with none, the body
    meshes come straight out of the mesh archive. That is the only version of
    this that survives ten races, let alone a game's worth.
    """
    dest = BUILD_DIR / plan.character_id / "data-root"
    if dest.exists():
        shutil.rmtree(dest)
    if plan.data_root.exists() and plan.data_root != dest:
        shutil.copytree(plan.data_root, dest, copy_function=_copy_curated_file)
    else:
        dest.mkdir(parents=True, exist_ok=True)
        mesh_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / "Skyrim - Meshes.bsa")
        for mesh in plan.meshes:
            # The path a mesh sits at inside the data root *is* its path inside
            # the archive. Deriving it that way rather than reassembling it from
            # the body's mesh directory is what lets a race pull in something
            # that lives somewhere else entirely — hair, two folders down.
            archive_path = mesh.file.relative_to(plan.data_root).as_posix()
            if not mesh_bsa.contains(archive_path):
                raise KeyError(f"{mesh.name}: {archive_path} not in the mesh archive")
            mesh_bsa.extract([archive_path], dest)

    texture_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["textureBsa"])
    wanted: set[str] = set()
    for mesh in plan.meshes:
        wanted |= _referenced_textures(_portable_source_path(mesh.file))

    missing = [t for t in sorted(wanted) if not (dest / t).exists()]
    filled, absent = [], []
    for tex in missing:
        if texture_bsa.contains(tex):
            texture_bsa.extract([tex], dest)
            filled.append(tex)
        else:
            absent.append(tex)
    # A race's own head normal, eyes or beast skin arrive as a substitution:
    # extract the archive's file *into the path the NIF asks for*, so no mesh
    # or material has to know which race it is being built for.
    substituted = []
    for referenced, source in plan.texture_substitutions.items():
        if not texture_bsa.contains(source):
            raise KeyError(f"texture substitution source missing: {source}")
        target = dest / referenced
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(texture_bsa.read(source))
        substituted.append(f"{Path(source).name} -> {referenced.split('/')[-1]}")

    print(f"[data-root] textures referenced={len(wanted)} filled={len(filled)} "
          f"already-present={len(wanted) - len(missing)} unresolved={len(absent)} "
          f"substituted={len(substituted)}")
    for tex in absent:
        print(f"[data-root]   UNRESOLVED texture: {tex}")
    for swap in substituted:
        print(f"[data-root]   substituted {swap}")
    return dest


def assemble_animations(plan: BuildPlan) -> dict[str, Path]:
    """Return semantic -> host HKX path, extracting from the BSA as needed."""
    anim_dir = BUILD_DIR / plan.character_id / "anims"
    anim_dir.mkdir(parents=True, exist_ok=True)
    animation_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["animationBsa"])

    resolved: dict[str, Path] = {}
    for spec in plan.animations:
        override = plan.anim_local_overrides.get(spec.source)
        if override and Path(override).exists():
            resolved[spec.semantic] = Path(override)
            continue
        archive_path = f"{plan.anim_source_dir}/{spec.source}.hkx"
        dest = anim_dir / f"{spec.source}.hkx"
        # Sources may name a gendered/variant subfolder ("male/mt_runforward").
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            if not animation_bsa.contains(archive_path):
                raise KeyError(f"{spec.semantic}: {archive_path} not in animation BSA")
            data = animation_bsa.read(archive_path)
            dest.write_bytes(data)
        resolved[spec.semantic] = dest
    print(f"[anims] resolved {len(resolved)} semantic animations")
    return resolved


def assemble_auxiliary_animations(plan: BuildPlan) -> dict[str, dict[str, Path]]:
    """Resolve the auxiliary-bone clip that pairs with each semantic animation.

    Skyrim authors a tail clip alongside the body clip it belongs to, under the
    same filename, so the pairing needs no configuration: look for the body
    clip's own name in the auxiliary directory and use it if it is there. A
    clip with no partner simply leaves those bones in their rest pose.
    """
    resolved: dict[str, dict[str, Path]] = {}
    animation_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["animationBsa"])
    for aux_id, aux in plan.auxiliary_bones.items():
        directory = aux.get("animationDir")
        if not directory:
            continue
        aux_dir = BUILD_DIR / plan.character_id / "aux" / aux_id
        aux_dir.mkdir(parents=True, exist_ok=True)
        found: dict[str, Path] = {}
        for spec in plan.animations:
            if not spec.tail_source:
                continue
            archive_path = f"{directory}/{spec.tail_source}.hkx"
            if not animation_bsa.contains(archive_path):
                continue
            dest = aux_dir / f"{spec.tail_source}.hkx"
            if not dest.exists():
                dest.write_bytes(animation_bsa.read(archive_path))
            found[spec.semantic] = dest
        resolved[aux_id] = found
        print(f"[anims] {aux_id}: {len(found)}/{len(plan.animations)} clips have an authored partner")
    return resolved


# ---------------------------------------------------------------------------
# Blender invocation
# ---------------------------------------------------------------------------

def write_blender_plan(
    plan: BuildPlan,
    data_root: Path,
    anims: dict[str, Path],
    aux_anims: dict[str, dict[str, Path]] | None = None,
) -> Path:
    """Serialise a Windows-path plan the in-Blender script consumes verbatim."""
    plan_path = BUILD_DIR / plan.character_id / "blender-plan.json"
    payload = {
        "addon": TOOLCHAIN["addon"],
        "expected_bones": plan.expected_bones,
        "root_bone": plan.root_bone,
        "sockets": plan.sockets,
        "skeleton": to_windows(plan.skeleton),
        "rig_import": plan.rig_import,
        "auxiliary_bones": {
            aux_id: {
                **{k: v for k, v in aux.items() if k != "skeleton"},
                "skeleton": to_windows(Path(aux["skeleton"])),
                "animations": {
                    semantic: to_windows(path)
                    for semantic, path in (aux_anims or {}).get(aux_id, {}).items()
                },
            }
            for aux_id, aux in plan.auxiliary_bones.items()
        },
        "skin_tint": list(plan.skin_tint),
        "exports": [
            {**export, "path": to_windows((ROOT / export["path"]).resolve())}
            for export in plan.exports
        ],
        "data_root_win": to_windows(data_root),
        "meshes": [
            {"name": m.name,
             "file": to_windows(data_root / m.file.relative_to(plan.data_root))}
            for m in plan.meshes
        ],
        "mesh_import": plan.mesh_import,
        "morph": ({**plan.morph, "tri": to_windows(Path(plan.morph["tri"]))}
                  if plan.morph else None),
        "material_overrides": [
            {**ov, "replaceWith": to_windows(data_root / ov["replaceWith"])}
            for ov in plan.material_overrides
        ],
        "animations": [
            {
                "semantic": s.semantic,
                "looping": s.looping,
                "root_motion": s.root_motion,
                "playback_rate": s.playback_rate,
                "playback_start_time": s.playback_start_time,
                "preserve_root_motion": s.preserve_root_motion,
                "strip_vertical_root_motion": s.strip_vertical_root_motion,
                "preserve_root_motion_axes": list(s.preserve_root_motion_axes),
                "support_sample_rate": s.support_sample_rate,
                "remove_quaternion_keys": [
                    {"bone": removal.bone, "source_time": removal.source_time}
                    for removal in s.remove_quaternion_keys
                ],
                # Some Skyrim killmoves store both actors in one PairedRoot
                # animation.  An empty prefix selects the ordinary ``NPC``
                # actor; ``2_`` selects and normalises the second actor.
                "paired_track_prefix": s.extra.get("pairedTrackPrefix"),
                "hkx": to_windows(anims[s.semantic]),
            }
            for s in plan.animations
        ],
        "scale_reference": plan.scale_reference,
        "output_glb": to_windows(plan.output_glb),
        "summary_json": to_windows(BUILD_DIR / plan.character_id / "blender-summary.json"),
    }
    plan_path.write_text(json.dumps(payload, indent=2))
    return plan_path


def run_blender(plan_path: Path, output_glb: Path) -> dict:
    """Run the headless Blender build and prove *this* run produced the output.

    Blender's ``--background --python`` still exits 0 when the script raises, so
    an exit code alone cannot detect a failed build. Both products are removed
    up front and the script's explicit ``SUMMARY_WRITTEN`` marker is required,
    otherwise a stale GLB/summary left by an earlier run would be read back as a
    fresh success and silently republished with a new manifest.
    """
    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    cmd = [
        str(_expand(TOOLCHAIN["wine"])),
        str(_expand(TOOLCHAIN["blender"])),
        "--background",
        "--python", to_windows(BLENDER_SCRIPT),
    ]
    summary_path = ROOT / "build" / (plan_path.parent.name) / "blender-summary.json"
    summary_path.unlink(missing_ok=True)
    output_glb.unlink(missing_ok=True)
    print("[blender] launching headless build...")
    proc = subprocess.run(
        cmd, env=env, capture_output=True, text=True,
        timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900),
    )
    completed = False
    for line in proc.stdout.splitlines():
        if line.strip() == "SUMMARY_WRITTEN":
            completed = True
        if line.startswith("[build]") or line.startswith("SUMMARY"):
            print("   " + line)
    if (proc.returncode != 0 or not completed
            or not summary_path.exists() or not output_glb.exists()):
        sys.stderr.write(proc.stdout[-4000:])
        sys.stderr.write(proc.stderr[-4000:])
        raise RuntimeError("Blender build failed; see output above")
    return json.loads(summary_path.read_text())


# ---------------------------------------------------------------------------
# Runtime manifest
# ---------------------------------------------------------------------------

def _pack_id_of(plan: BuildPlan, export: dict) -> str:
    """Which pack an export's action list belongs to.

    Matched on the clip set rather than trusting a name in two places: the
    export list is built from the same plan, so a mismatch here means the pack
    assignment and the emitted file have genuinely diverged.
    """
    clips = set(export["actions"])
    for pack_id in plan.animation_packs or {}:
        if {a.semantic for a in plan.animations if a.pack == pack_id} == clips:
            return pack_id
    raise ValueError(f"export {export['path']} does not match any declared animation pack")


def write_runtime_manifest(plan: BuildPlan, summary: dict) -> None:
    durations = summary.get("durations", {})
    root_deltas = summary.get("rootMotionDeltas", {})
    support_envelopes = summary.get("supportEnvelopes", {})
    for spec in plan.animations:
        source_duration = durations.get(spec.semantic)
        if not isinstance(source_duration, (int, float)):
            raise ValueError(
                f"{spec.semantic}: built source duration is missing"
            )
        playback_start = 0 if spec.playback_start_time is None else spec.playback_start_time
        if (not isinstance(playback_start, (int, float)) or isinstance(playback_start, bool)
                or playback_start < 0 or playback_start >= source_duration):
            raise ValueError(
                f"{spec.semantic}: playbackStartTime must be within the built source duration"
            )
        playback_end = source_duration if spec.playback_end_time is None else spec.playback_end_time
        if (not isinstance(playback_end, (int, float)) or isinstance(playback_end, bool)
                or playback_end <= playback_start
                or playback_end > source_duration + 1e-4):
            raise ValueError(
                f"{spec.semantic}: playbackEndTime must be after playbackStartTime "
                "and within the built source duration"
            )
        for phase in spec.support_phases:
            if phase["endTime"] > source_duration + 1e-4:
                raise ValueError(
                    f"{spec.semantic}: support phase ending at {phase['endTime']} "
                    f"exceeds source duration {source_duration}"
                )
        envelope = support_envelopes.get(spec.semantic)
        expected_support_interval = 1.0 / spec.support_sample_rate
        expected_support_samples = max(
            2,
            round(source_duration * spec.support_sample_rate) + 1,
        )
        if (not isinstance(envelope, dict)
                or not isinstance(envelope.get("sampleStartTimeSeconds"), (int, float))
                or isinstance(envelope.get("sampleStartTimeSeconds"), bool)
                or envelope["sampleStartTimeSeconds"] < 0
                or not isinstance(envelope.get("sampleIntervalSeconds"), (int, float))
                or isinstance(envelope.get("sampleIntervalSeconds"), bool)
                or abs(envelope["sampleIntervalSeconds"] - expected_support_interval) > 1e-6
                or not isinstance(envelope.get("authoredGroundSpeed"), (int, float))
                or isinstance(envelope.get("authoredGroundSpeed"), bool)
                or envelope["authoredGroundSpeed"] < 0
                or not isinstance(envelope.get("surfaceMinZ"), list)
                or len(envelope["surfaceMinZ"]) != expected_support_samples
                or not isinstance(envelope.get("soleMarkerMinZ"), list)
                or len(envelope["soleMarkerMinZ"]) != len(envelope["surfaceMinZ"])
                or not isinstance(envelope.get("soleMarkerZById"), dict)
                or set(envelope["soleMarkerZById"]) != {"footL", "footR", "toeL", "toeR"}
                or any(
                    not isinstance(samples, list)
                    or len(samples) != len(envelope["surfaceMinZ"])
                    for samples in envelope["soleMarkerZById"].values()
                )
                or not isinstance(envelope.get("soleMarkerClearanceZById"), dict)
                or set(envelope["soleMarkerClearanceZById"]) != {"footL", "footR", "toeL", "toeR"}
                or any(
                    not isinstance(samples, list)
                    or len(samples) != len(envelope["surfaceMinZ"])
                    for samples in envelope["soleMarkerClearanceZById"].values()
                )
                or not isinstance(envelope.get("soleMarkerPointBoneLocalById"), dict)
                or set(envelope["soleMarkerPointBoneLocalById"]) != {"footL", "footR", "toeL", "toeR"}
                or any(
                    not isinstance(samples, list)
                    or len(samples) != len(envelope["surfaceMinZ"])
                    or any(
                        not isinstance(point, list)
                        or len(point) != 3
                        or any(not isinstance(value, (int, float)) for value in point)
                        for point in samples
                    )
                    for samples in envelope["soleMarkerPointBoneLocalById"].values()
                )):
            raise ValueError(
                f"{spec.semantic}: built support envelope is missing or does not "
                f"match its configured {spec.support_sample_rate} Hz sample rate"
            )
    hurtbox_segments = summary.get("hurtboxSegments")
    if (not isinstance(hurtbox_segments, list) or not hurtbox_segments
            or any(
                not isinstance(segment, dict)
                or not isinstance(segment.get("bone"), str)
                or not isinstance(segment.get("radius"), (int, float))
                or isinstance(segment.get("radius"), bool)
                or segment["radius"] <= 0
                or not isinstance(segment.get("halfLength"), (int, float))
                or isinstance(segment.get("halfLength"), bool)
                or segment["halfLength"] < 0
                or any(
                    not isinstance(segment.get(end), list)
                    or len(segment[end]) != 3
                    or any(not isinstance(value, (int, float)) for value in segment[end])
                    for end in ("from", "to")
                )
                for segment in hurtbox_segments
            )):
        raise ValueError("built hurtbox segments are missing or malformed")

    # bbox is Blender Z-up; glTF is exported Y-up so the up-axis maps Z -> height.
    bbox = summary.get("bboxSize", [0, 0, 0])
    height = bbox[2] if len(bbox) == 3 and bbox[2] else 1.0
    recommended_scale = round(plan.target_height / height, 5) if height else 1.0
    # Animation packs: which GLB each clip actually ships in, so the runtime can
    # fetch a weapon's motion only when an actor holds that weapon. Sizes and
    # hashes are recorded here because this manifest is the game's contract with
    # the built binaries — a pack the game asks for and cannot verify is exactly
    # the failure the rig's own `assetSha256` already guards against.
    pack_exports = {
        pack_id: export
        for export in plan.exports
        if export.get("actions")
        for pack_id in [_pack_id_of(plan, export)]
    }
    packs = {}
    for pack_id, meta in (plan.animation_packs or {}).items():
        export = pack_exports.get(pack_id)
        if export is None:
            continue
        asset = (ROOT / export["path"]).resolve()
        packs[pack_id] = {
            "asset": asset.name,
            "description": meta.get("description", ""),
            "sha256": hashlib.sha256(asset.read_bytes()).hexdigest(),
            "bytes": asset.stat().st_size,
            "clips": sorted(export["actions"]),
        }
        # A pack that borrows another's carriage or shared choreography names it
        # here, so the runtime resolves the closure instead of every call site
        # remembering that a warhammer also needs the greatsword's footwork.
        if meta.get("requires"):
            packs[pack_id]["requires"] = list(meta["requires"])

    manifest = {
        "character": plan.character_id,
        "assetSha256": hashlib.sha256(plan.output_glb.read_bytes()).hexdigest(),
        "packs": packs,
        "source": "Skyrim vanilla + permitted mod HKX (locally regenerated authorized runtime build)",
        "rig": {
            "rootBone": plan.root_bone,
            "sockets": plan.sockets,
            # Rig-level convention offset from weapon-asset space into any
            # socket bone's local space. Weapon definitions carry only their own
            # deliberate offsets, so a new weapon needs no hand-tuned rotation.
            "socketRotation": list(plan.socket_rotation),
            "recommendedScale": recommended_scale,
            "targetHeightMeters": plan.target_height,
        },
        "supportCalibration": plan.support_calibration,
        # Skeleton-fitted combat volume. Each capsule is anchored to a bone and
        # expressed in that bone's local space, so the runtime follows the live
        # animated pose and an arbitrary new skeleton needs no hand authoring.
        # Endpoints stay in unscaled GLB units (the actor's own scale is
        # inherited through the bone); the radius is pre-scaled to metres.
        "hurtbox": {
            "segments": [
                {
                    "bone": segment["bone"],
                    "from": [round(value, 6) for value in segment["from"]],
                    "to": [round(value, 6) for value in segment["to"]],
                    "radius": round(segment["radius"] * recommended_scale, 5),
                    "halfLength": round(segment["halfLength"] * recommended_scale, 5),
                }
                for segment in hurtbox_segments
            ],
        },
        "animations": {
            s.semantic: {
                "pack": s.pack,
                "looping": s.looping,
                "rootMotion": s.root_motion,
                "playbackRate": s.playback_rate,
                "crossFadeDuration": s.cross_fade_duration,
                "crossFadeOutDuration": s.cross_fade_out_duration,
                "sourceDuration": durations.get(s.semantic),
                "playbackStartTime": s.playback_start_time,
                "playbackEndTime": s.playback_end_time,
                "rootMotionDelta": root_deltas.get(s.semantic),
                "supportMode": s.support_mode,
                "supportPhases": list(s.support_phases),
                # Measured travel speed the authored stride is timed for, in
                # runtime metres/second. Locomotion time-scaling reads this so a
                # clip never has to be hand-matched to a controller speed.
                "authoredGroundSpeed": round(
                    support_envelopes[s.semantic]["authoredGroundSpeed"] * recommended_scale,
                    5,
                ),
                "supportEnvelope": {
                    "sampleStartTimeSeconds": support_envelopes[s.semantic]["sampleStartTimeSeconds"],
                    "sampleIntervalSeconds": support_envelopes[s.semantic]["sampleIntervalSeconds"],
                    # Blender is Z-up and glTF export is Y-up. Values are
                    # relative to the GLB actor root and scaled to runtime
                    # metres, ready for O(1) interpolation in the game.
                    "surfaceMinY": [
                        round(value * recommended_scale, 5)
                        for value in support_envelopes[s.semantic]["surfaceMinZ"]
                    ],
                    "soleMarkerMinY": [
                        round(value * recommended_scale, 5)
                        for value in support_envelopes[s.semantic]["soleMarkerMinZ"]
                    ],
                    "soleMarkerYById": {
                        marker_id: [
                            round(value * recommended_scale, 5)
                            for value in samples
                        ]
                        for marker_id, samples in support_envelopes[s.semantic]["soleMarkerZById"].items()
                    },
                    "soleMarkerClearanceYById": {
                        marker_id: [
                            round(value * recommended_scale, 5)
                            for value in samples
                        ]
                        for marker_id, samples in support_envelopes[s.semantic]["soleMarkerClearanceZById"].items()
                    },
                    # Bone-local GLB units: runtime actor scaling is inherited
                    # through the transformed bone, so these are deliberately
                    # not pre-scaled like root-relative vertical envelopes.
                    "soleMarkerPointBoneLocalById": {
                        marker_id: samples
                        for marker_id, samples in support_envelopes[s.semantic]["soleMarkerPointBoneLocalById"].items()
                    },
                },
                "provenance": s.provenance,
            }
            for s in plan.animations
        },
    }
    plan.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    plan.output_manifest.write_text(json.dumps(manifest, indent=2))
    print(f"[manifest] wrote {plan.output_manifest}")


def build(character_id: str) -> dict:
    plan = resolve_character(character_id)
    (BUILD_DIR / plan.character_id).mkdir(parents=True, exist_ok=True)
    data_root = assemble_data_root(plan)
    anims = assemble_animations(plan)
    aux_anims = assemble_auxiliary_animations(plan)
    plan_path = write_blender_plan(plan, data_root, anims, aux_anims)
    summary = run_blender(plan_path, plan.output_glb)
    write_runtime_manifest(plan, summary)
    print(f"[build] GLB -> {plan.output_glb}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a game-ready character GLB from Skyrim source.")
    parser.add_argument("--character", default="dunmer-combat", help="character config id")
    args = parser.parse_args()
    build(args.character)


if __name__ == "__main__":
    main()
