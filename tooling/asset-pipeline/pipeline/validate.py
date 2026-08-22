"""Validate an emitted character GLB without a 3D engine.

Parses the glTF JSON chunk directly and asserts the structural contract:
one skinned armature, the complete set of semantic animations, and no
unresolved (magenta / missing) materials.

Usage:
    python -m pipeline.validate --character dunmer-combat
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path

from .models import resolve_character


ANIMATION_TIME_TOLERANCE_SECONDS = 1e-4


def read_glb_chunks(glb: Path) -> tuple[dict, bytes]:
    """Return the JSON and embedded binary chunks from a portable GLB."""
    data = glb.read_bytes()
    if len(data) < 20:
        raise ValueError(f"{glb} is truncated")
    magic, version, length = struct.unpack("<4sII", data[:12])
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError(f"{glb} is not a GLB")
    offset = 12
    chunk_len, chunk_type = struct.unpack("<II", data[offset:offset + 8])
    if chunk_type != 0x4E4F534A:  # 'JSON'
        raise ValueError("first chunk is not JSON")
    json_end = offset + 8 + chunk_len
    gltf = json.loads(data[offset + 8:json_end])
    binary = b""
    if json_end + 8 <= len(data):
        binary_len, binary_type = struct.unpack("<II", data[json_end:json_end + 8])
        if binary_type != 0x004E4942:  # 'BIN\0'
            raise ValueError("second chunk is not BIN")
        binary = data[json_end + 8:json_end + 8 + binary_len]
    return gltf, binary


def read_gltf_json(glb: Path) -> dict:
    """Compatibility wrapper for callers that only need GLB structure."""
    return read_glb_chunks(glb)[0]


def read_float_accessor(gltf: dict, binary: bytes, accessor_index: int) -> list[tuple[float, ...]]:
    """Decode a tightly or interleaved float accessor from the embedded BIN."""
    accessors = gltf.get("accessors", [])
    views = gltf.get("bufferViews", [])
    if accessor_index < 0 or accessor_index >= len(accessors):
        raise ValueError(f"invalid accessor {accessor_index}")
    accessor = accessors[accessor_index]
    view_index = accessor.get("bufferView")
    if not isinstance(view_index, int) or view_index < 0 or view_index >= len(views):
        raise ValueError(f"accessor {accessor_index} has no valid bufferView")
    if accessor.get("componentType") != 5126 or accessor.get("sparse") is not None:
        raise ValueError(f"accessor {accessor_index} is not a dense float accessor")
    components = {
        "SCALAR": 1,
        "VEC2": 2,
        "VEC3": 3,
        "VEC4": 4,
    }.get(accessor.get("type"))
    count = accessor.get("count")
    if components is None or not isinstance(count, int) or count < 0:
        raise ValueError(f"accessor {accessor_index} has invalid shape")
    view = views[view_index]
    if view.get("buffer", 0) != 0:
        raise ValueError(f"accessor {accessor_index} is not in the embedded buffer")
    element_size = components * 4
    stride = view.get("byteStride", element_size)
    if not isinstance(stride, int) or stride < element_size:
        raise ValueError(f"accessor {accessor_index} has invalid byteStride")
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    if not isinstance(start, int) or start < 0:
        raise ValueError(f"accessor {accessor_index} has invalid byteOffset")
    fmt = "<" + "f" * components
    values = []
    for index in range(count):
        offset = start + index * stride
        if offset + element_size > len(binary):
            raise ValueError(f"accessor {accessor_index} exceeds the BIN chunk")
        values.append(struct.unpack_from(fmt, binary, offset))
    return values


def loop_animation_timeline_issues(gltf: dict, animation_specs, manifest: dict) -> list[str]:
    """Return structural clock errors for declared looping animations only.

    Skyrim/PyNifly imports use absolute frames 1..N. A loop exported without
    rebasing therefore has a one-frame lead-in even though its source span is
    still (N-1)/30, causing Three.js to hold the duplicated endpoint at every
    wrap. One-shots intentionally retain their established source timestamps,
    so this contract must remain scoped to animations declared as loops.
    """
    accessors = gltf.get("accessors", [])
    exported = {animation.get("name"): animation for animation in gltf.get("animations", [])}
    manifest_animations = manifest.get("animations", {}) if isinstance(manifest, dict) else {}
    issues: list[str] = []

    for spec in animation_specs:
        if not spec.looping:
            continue
        animation = exported.get(spec.semantic)
        manifest_entry = manifest_animations.get(spec.semantic)
        source_duration = manifest_entry.get("sourceDuration") if isinstance(manifest_entry, dict) else None
        if not isinstance(source_duration, (int, float)) or isinstance(source_duration, bool) \
                or not math.isfinite(source_duration) or source_duration <= 0:
            issues.append(f"{spec.semantic}: manifest sourceDuration is missing or invalid")
            continue
        if not isinstance(animation, dict) or not animation.get("samplers"):
            issues.append(f"{spec.semantic}: exported loop has no animation samplers")
            continue

        input_accessors = set()
        for sampler in animation["samplers"]:
            accessor_index = sampler.get("input") if isinstance(sampler, dict) else None
            if (not isinstance(accessor_index, int) or isinstance(accessor_index, bool)
                    or accessor_index < 0 or accessor_index >= len(accessors)):
                issues.append(f"{spec.semantic}: sampler has an invalid input accessor")
                continue
            input_accessors.add(accessor_index)
        for accessor_index in sorted(input_accessors):
            accessor = accessors[accessor_index]
            minimum = accessor.get("min") if isinstance(accessor, dict) else None
            maximum = accessor.get("max") if isinstance(accessor, dict) else None
            start = minimum[0] if isinstance(minimum, list) and minimum else None
            end = maximum[0] if isinstance(maximum, list) and maximum else None
            if (not isinstance(start, (int, float)) or isinstance(start, bool)
                    or not isinstance(end, (int, float)) or isinstance(end, bool)
                    or not math.isfinite(start) or not math.isfinite(end) or end <= start):
                issues.append(
                    f"{spec.semantic}: input accessor {accessor_index} has invalid time bounds"
                )
                continue
            if abs(start) > ANIMATION_TIME_TOLERANCE_SECONDS:
                issues.append(
                    f"{spec.semantic}: input accessor {accessor_index} starts at "
                    f"{start:.7f}s instead of 0"
                )
            exported_duration = end - start
            if abs(exported_duration - source_duration) > ANIMATION_TIME_TOLERANCE_SECONDS:
                issues.append(
                    f"{spec.semantic}: input accessor {accessor_index} duration "
                    f"{exported_duration:.7f}s != manifest span {source_duration:.7f}s"
                )
    return issues


def _rotation_sampler(gltf: dict, animation: dict, node_index: int) -> int | None:
    """Return the single rotation sampler index driving ``node_index``."""
    channels = [
        channel for channel in animation.get("channels", [])
        if isinstance(channel, dict)
        and channel.get("target", {}).get("node") == node_index
        and channel.get("target", {}).get("path") == "rotation"
    ]
    if len(channels) != 1:
        return None
    sampler_index = channels[0].get("sampler")
    samplers = animation.get("samplers", [])
    if (not isinstance(sampler_index, int)
            or sampler_index < 0
            or sampler_index >= len(samplers)):
        return None
    return sampler_index


def quaternion_key_conditioning_issues(
    gltf: dict,
    binary: bytes,
    animation_specs,
) -> list[str]:
    """Prove declared curve conditioning produced a continuous exported curve.

    Removal cannot be checked by absence. The glTF exporter samples pose bones
    at the scene frame rate, so the exported curve owns a key at every interior
    instant whether or not a source key was removed. What conditioning changes
    is the *value* the runtime slerps through, so each declared window is
    measured for its worst rendered angular step: an outlier that survived
    still shows its excursion and its return, while a repaired window steps
    smoothly between the retained neighbours.
    """
    nodes = gltf.get("nodes", [])
    animations = {
        animation.get("name"): animation
        for animation in gltf.get("animations", [])
        if isinstance(animation, dict)
    }
    issues: list[str] = []
    for spec in animation_specs:
        for check in getattr(spec, "exported_continuity", ()):
            animation = animations.get(spec.semantic)
            if not isinstance(animation, dict):
                issues.append(f"{spec.semantic}: conditioned animation is missing")
                continue
            node_indices = [
                index for index, node in enumerate(nodes)
                if isinstance(node, dict) and node.get("name") == check.bone
            ]
            if len(node_indices) != 1:
                issues.append(
                    f"{spec.semantic}: conditioned bone {check.bone!r} resolved to "
                    f"{len(node_indices)} nodes"
                )
                continue
            sampler_index = _rotation_sampler(gltf, animation, node_indices[0])
            if sampler_index is None:
                issues.append(
                    f"{spec.semantic}: conditioned bone {check.bone!r} has no single "
                    "rotation sampler"
                )
                continue
            sampler = animation["samplers"][sampler_index]
            try:
                times = read_float_accessor(gltf, binary, sampler.get("input"))
                values = read_float_accessor(gltf, binary, sampler.get("output"))
            except (TypeError, ValueError) as error:
                issues.append(
                    f"{spec.semantic}: cannot read conditioned rotation curve: {error}"
                )
                continue
            if len(times) != len(values):
                issues.append(
                    f"{spec.semantic}: conditioned rotation curve has "
                    f"{len(times)} times and {len(values)} values"
                )
                continue
            window = [
                (time[0], value) for time, value in zip(times, values)
                if check.start_time - ANIMATION_TIME_TOLERANCE_SECONDS <= time[0]
                <= check.end_time + ANIMATION_TIME_TOLERANCE_SECONDS
            ]
            if len(window) < 2:
                issues.append(
                    f"{spec.semantic}: {check.bone} has {len(window)} exported keys in "
                    f"{check.start_time:.7f}-{check.end_time:.7f}s; the declared window "
                    "cannot prove continuity"
                )
                continue
            worst_step = 0.0
            worst_time = window[0][0]
            for (_, previous), (time, current) in zip(window, window[1:]):
                dot = min(1.0, abs(sum(a * b for a, b in zip(previous, current))))
                step = math.degrees(2.0 * math.acos(dot))
                if step > worst_step:
                    worst_step, worst_time = step, time
            if worst_step > check.max_angular_step_degrees:
                issues.append(
                    f"{spec.semantic}: {check.bone} steps {worst_step:.3f} deg at "
                    f"{worst_time:.7f}s, over the declared "
                    f"{check.max_angular_step_degrees:.3f} deg conditioning limit"
                )
    return issues


def validate(character_id: str) -> bool:
    plan = resolve_character(character_id)
    glb = plan.output_glb
    if not glb.exists():
        print(f"FAIL: GLB not found at {glb}")
        return False

    gltf, binary = read_glb_chunks(glb)
    ok = True

    def check(cond: bool, label: str) -> None:
        nonlocal ok
        print(("  PASS " if cond else "  FAIL ") + label)
        ok = ok and cond

    skins = gltf.get("skins", [])
    check(len(skins) == 1, f"exactly one skin/armature (got {len(skins)})")

    meshes = gltf.get("meshes", [])
    check(len(meshes) >= 6, f"character meshes present (got {len(meshes)})")

    joints = len(skins[0]["joints"]) if skins else 0
    check(joints == plan.expected_bones, f"skin joints == {plan.expected_bones} (got {joints})")

    anim_names = {a.get("name") for a in gltf.get("animations", [])}
    expected = {s.semantic for s in plan.animations}
    missing = sorted(expected - anim_names)
    extra = sorted(anim_names - expected)
    check(not missing, f"all {len(expected)} semantic animations present"
          + (f"; MISSING {missing}" if missing else ""))
    if extra:
        print(f"  note: extra animations in GLB: {extra}")

    manifest = None
    if plan.output_manifest.exists():
        try:
            manifest = json.loads(plan.output_manifest.read_text())
        except (OSError, json.JSONDecodeError):
            pass
    check(manifest is not None, f"runtime animation manifest is readable ({plan.output_manifest.name})")
    loop_timeline_issues = loop_animation_timeline_issues(
        gltf,
        plan.animations,
        manifest or {},
    )
    check(
        not loop_timeline_issues,
        "loop animation inputs start at zero and match their manifest source spans",
    )
    for issue in loop_timeline_issues:
        print(f"       {issue}")
    conditioning_issues = quaternion_key_conditioning_issues(
        gltf,
        binary,
        plan.animations,
    )
    check(
        not conditioning_issues,
        "declared curve conditioning holds in the exported rotation curves",
    )
    for issue in conditioning_issues:
        print(f"       {issue}")

    # Material soundness: every material resolves a base colour (texture or factor).
    images = gltf.get("images", [])
    textures = gltf.get("textures", [])
    bad_materials = []
    for mat in gltf.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        has_texture = "baseColorTexture" in pbr
        has_factor = "baseColorFactor" in pbr
        if not has_texture and not has_factor:
            bad_materials.append(mat.get("name", "?"))
    check(not bad_materials, "all materials have a base colour"
          + (f"; BAD {bad_materials}" if bad_materials else ""))
    check(len(images) > 0, f"embedded textures present (got {len(images)} images, {len(textures)} textures)")

    # No external image URIs (must be embedded for a portable GLB).
    external = [img.get("uri") for img in images if img.get("uri") and not img["uri"].startswith("data:")]
    check(not external, "all images embedded (no external URIs)"
          + (f"; EXTERNAL {external}" if external else ""))

    print(f"\n{'OK' if ok else 'FAILED'}: {glb.name} "
          f"({joints} joints, {len(meshes)} meshes, {len(anim_names)} anims, {len(images)} textures)")
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a built character GLB.")
    parser.add_argument("--character", default="dunmer-combat")
    args = parser.parse_args()
    if not validate(args.character):
        sys.exit(1)


if __name__ == "__main__":
    main()
