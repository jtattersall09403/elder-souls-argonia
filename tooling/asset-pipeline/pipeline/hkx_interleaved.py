"""Read ``hkaInterleavedUncompressedAnimation`` HKX and rewrite it spline-compressed.

The pipeline's importer is PyNifly, whose Havok reader
(``io_scene_nifly/hkx/anim_skyrim.py``) parses exactly one animation class,
``hkaSplineCompressedAnimation``.  Part of Animated Armoury (Nexus SSE 35978),
including the whole drawn-katana set in folders 19 and 20, is stored in the
uncompressed interleaved class instead, so those clips could not be read
(decision 0077 §5a).

Interleaved data is far simpler than the spline form: a flat, frame-major array
of ``hkQsTransform``.  This module parses it into PyNifly's own
``AnimationData`` and hands it to PyNifly's own
``write_skyrim_animation``, which already knows how to B-spline-fit and write a
Skyrim SE packfile.  Everything downstream (the character builder, the
retiming, the manifest) is unchanged: it sees an ordinary spline clip.

Nothing in PyNifly is modified.  Its modules are loaded standalone (importing
the package itself would pull in ``bpy``).

CLI::

    python3 -m pipeline.hkx_interleaved --src <dir-or-file> --dst <dir>
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import struct
import sys
import types
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

#: Directory holding PyNifly's ``hkx`` modules. The Blender addon copy is
#: authoritative (it is what a build run actually executes); the standalone
#: checkout is byte-identical and used as a fallback.
_HKX_DIR_CANDIDATES = (
    Path.home() / "tools/blender-4.4.3-windows-x64/4.4/scripts/addons_core/io_scene_nifly/hkx",
    Path.home() / "tools/PyNifly/io_scene_nifly/hkx",
)

#: One ``hkQsTransform``: translation xyz + pad, rotation xyzw, scale xyz + pad.
QS_TRANSFORM_SIZE = 48

_ANIM_CLASS = "hkaInterleavedUncompressedAnimation"


def hkx_dir() -> Path:
    """Return the PyNifly ``hkx`` module directory."""
    override = os.environ.get("ES_PYNIFLY_HKX")
    if override:
        return Path(override).expanduser()
    for cand in _HKX_DIR_CANDIDATES:
        if (cand / "anim_skyrim.py").exists():
            return cand
    raise FileNotFoundError(
        "PyNifly hkx modules not found; set ES_PYNIFLY_HKX to the directory "
        "holding anim_skyrim.py"
    )


def load_pynifly() -> Tuple[types.ModuleType, types.ModuleType]:
    """Load ``anim_fo4`` and ``anim_skyrim`` without importing ``bpy``.

    ``anim_skyrim`` does ``from .anim_fo4 import ...``, so a stub ``hkx``
    package has to exist in ``sys.modules`` first for the relative import to
    resolve.
    """
    if "hkx.anim_skyrim" in sys.modules:
        return sys.modules["hkx.anim_fo4"], sys.modules["hkx.anim_skyrim"]
    directory = hkx_dir()
    pkg = types.ModuleType("hkx")
    pkg.__path__ = [str(directory)]
    sys.modules.setdefault("hkx", pkg)
    loaded = []
    for name in ("anim_fo4", "anim_skyrim"):
        spec = importlib.util.spec_from_file_location(
            f"hkx.{name}", directory / f"{name}.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[f"hkx.{name}"] = module
        spec.loader.exec_module(module)
        loaded.append(module)
    return loaded[0], loaded[1]


# ── the interleaved parser ───────────────────────────────────────────────────

def parse_interleaved(data: bytes):
    """Parse an ``hkaInterleavedUncompressedAnimation`` packfile.

    Returns PyNifly's ``AnimationData`` with per-frame tracks in exactly the
    shape ``anim_fo4._decompress_spline`` produces, or ``None`` when the file
    is not an HKX packfile or holds no interleaved animation.
    """
    fo4, sk = load_pynifly()

    if data[:4] != sk._HKX_MAGIC:
        return None

    ptr = data[0x10]
    if ptr not in (4, 8):
        raise ValueError(f"unsupported pointer size {ptr}")

    sections = sk._parse_hkx_sections(data)
    cn_sec = sections.get("__classnames__")
    data_sec = sections.get("__data__")
    if not cn_sec or not data_sec:
        return None
    cn_start = cn_sec["offset"]
    data_abs = data_sec["offset"]

    fixups = sk._parse_local_fixups(data, data_sec)
    objects = sk._parse_virtual_fixups(data, data_sec, cn_start)

    anim_rel = next((rel for rel, cls in objects if cls == _ANIM_CLASS), None)
    if anim_rel is None:
        return None

    a = data_abs + anim_rel
    anim = fo4.AnimationData()

    # hkaAnimation: base(2*ptr) + type(4) duration(4) numTransformTracks(4)
    # numFloatTracks(4) extractedMotion(ptr) annotationTracks(hkArray).
    base = 2 * ptr
    arr_size = ptr + 8
    o_ann_tracks = base + 16 + ptr
    # hkaInterleavedUncompressedAnimation: transforms then floats, the first
    # pointer field aligned to the pointer size.
    o_transforms = (o_ann_tracks + arr_size + ptr - 1) & ~(ptr - 1)

    anim.duration = sk._f32(data, a + base + 4)
    anim.num_tracks = sk._u32(data, a + base + 8)

    count = sk._u32(data, a + o_transforms + ptr)
    if anim.num_tracks <= 0:
        raise ValueError("interleaved animation declares no transform tracks")
    if count % anim.num_tracks:
        raise ValueError(
            f"transform count {count} is not a multiple of "
            f"{anim.num_tracks} tracks")
    anim.num_frames = count // anim.num_tracks
    anim.frame_duration = (
        anim.duration / (anim.num_frames - 1) if anim.num_frames > 1
        else 1.0 / 30.0)

    content_rel = fixups.get(anim_rel + o_transforms)
    if content_rel is None and count:
        raise ValueError("transforms array has no local fixup")
    content_abs = data_abs + (content_rel or 0)

    # Havok stores interleaved data frame-major: frame * numTracks + track.
    tracks = [fo4.TrackData(translations=[], rotations=[], scales=[])
              for _ in range(anim.num_tracks)]
    for frame in range(anim.num_frames):
        row = content_abs + frame * anim.num_tracks * QS_TRANSFORM_SIZE
        for t in range(anim.num_tracks):
            off = row + t * QS_TRANSFORM_SIZE
            tx, ty, tz = struct.unpack_from("<3f", data, off)
            rx, ry, rz, rw = struct.unpack_from("<4f", data, off + 16)
            sx, sy, sz = struct.unpack_from("<3f", data, off + 32)
            track = tracks[t]
            track.translations.append([tx, ty, tz])
            track.rotations.append([rx, ry, rz, rw])
            track.scales.append([sx, sy, sz])
    anim.tracks = tracks

    _read_names_and_binding(data, data_abs, anim_rel, o_ann_tracks,
                            fixups, objects, ptr, anim, sk)
    return anim


def _read_names_and_binding(data, data_abs, anim_rel, o_ann_tracks, fixups,
                            objects, ptr_size, anim, sk) -> None:
    """Fill bone names, annotations and binding fields.

    These structures are on ``hkaAnimation``/``hkaAnimationBinding`` and are
    identical for spline and interleaved clips. The body below is copied
    verbatim from ``anim_skyrim._parse_animation_hkx`` (the annotation-track
    and ``hkaAnimationBinding`` blocks) because that function reads them
    inline and PyNifly is not modified here. Keep the two in step.
    """
    arr_size = ptr_size + 8

    ann_arr_rel = anim_rel + o_ann_tracks
    ann_count = sk._u32(data, data_abs + ann_arr_rel + ptr_size)
    ann_content_rel = fixups.get(ann_arr_rel)

    if ann_content_rel is not None and ann_count > 0:
        ANNTRACK_STRIDE = ptr_size + arr_size
        for i in range(ann_count):
            track_rel = ann_content_rel + i * ANNTRACK_STRIDE
            str_target_rel = fixups.get(track_rel)
            if str_target_rel is not None:
                anim.bone_names.append(
                    sk._read_null_string(data, data_abs + str_target_rel))
            else:
                anim.bone_names.append('')

            ann_events_rel = track_rel + ptr_size
            ann_events_count = sk._u32(data, data_abs + ann_events_rel + ptr_size)
            ann_events_content_rel = fixups.get(ann_events_rel)
            if ann_events_content_rel is not None and ann_events_count > 0:
                EVT_STRIDE = ptr_size + ptr_size
                for j in range(ann_events_count):
                    evt_rel = ann_events_content_rel + j * EVT_STRIDE
                    evt_time = sk._f32(data, data_abs + evt_rel)
                    evt_str_rel = fixups.get(evt_rel + ptr_size)
                    evt_text = ''
                    if evt_str_rel is not None:
                        evt_text = sk._read_null_string(data, data_abs + evt_str_rel)
                    anim.annotations.append(
                        sk.Annotation(time=evt_time, text=evt_text))

    bind_name_off = 2 * ptr_size
    bind_idx_off = bind_name_off + 2 * ptr_size

    for rel, cls in objects:
        if cls == 'hkaAnimationBinding':
            skel_name_rel = fixups.get(rel + bind_name_off)
            if skel_name_rel is not None:
                anim.original_skeleton_name = sk._read_null_string(
                    data, data_abs + skel_name_rel)
            idx_arr_rel = rel + bind_idx_off
            idx_count = sk._u32(data, data_abs + idx_arr_rel + ptr_size)
            idx_content_rel = fixups.get(idx_arr_rel)
            if idx_content_rel is not None and idx_count > 0:
                idx_abs = data_abs + idx_content_rel
                anim.track_to_bone_indices = [
                    struct.unpack_from('<h', data, idx_abs + i * 2)[0]
                    for i in range(idx_count)
                ]
            blend_hint_off = bind_idx_off + 2 * arr_size
            anim.blend_hint = sk._u32(data, data_abs + rel + blend_hint_off)
            break


# ── conversion ───────────────────────────────────────────────────────────────

def convert_to_spline(src: Path, dst: Path, ptr_size: int = 8):
    """Convert one interleaved HKX to a spline-compressed HKX.

    Returns the parsed source ``AnimationData``. Raises ``ValueError`` when the
    source holds no interleaved animation.
    """
    _, sk = load_pynifly()
    anim = parse_interleaved(Path(src).read_bytes())
    if anim is None:
        raise ValueError(f"no {_ANIM_CLASS} in {src}")
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    sk.write_skyrim_animation(str(dst), anim, ptr_size=ptr_size)
    return anim


def _quat_angle_deg(a, b) -> float:
    dot = abs(sum(a[i] * b[i] for i in range(4)))
    dot = min(1.0, max(-1.0, dot))
    import math
    return math.degrees(2.0 * math.acos(dot))


def round_trip_error(source, reloaded) -> Tuple[float, float]:
    """Return (max translation delta, max rotation delta in degrees)."""
    max_t = 0.0
    max_r = 0.0
    n = min(len(source.tracks), len(reloaded.tracks))
    for i in range(n):
        st, rt = source.tracks[i], reloaded.tracks[i]
        frames = min(len(st.translations), len(rt.translations))
        for f in range(frames):
            for axis in range(3):
                max_t = max(max_t, abs(st.translations[f][axis]
                                       - rt.translations[f][axis]))
        frames = min(len(st.rotations), len(rt.rotations))
        for f in range(frames):
            max_r = max(max_r, _quat_angle_deg(st.rotations[f], rt.rotations[f]))
    return max_t, max_r


def verify_round_trip(src: Path, dst: Path, source=None):
    """Reload ``dst`` and check it reproduces the interleaved source.

    Raises ``AssertionError`` on any mismatch. Returns
    ``(reloaded, max_translation, max_rotation_deg)``.
    """
    _, sk = load_pynifly()
    if source is None:
        source = parse_interleaved(Path(src).read_bytes())
    reloaded = sk.load_skyrim_animation(str(dst))
    assert reloaded.num_frames == source.num_frames, (
        f"frames {reloaded.num_frames} != {source.num_frames}")
    assert reloaded.num_tracks == source.num_tracks, (
        f"tracks {reloaded.num_tracks} != {source.num_tracks}")
    assert abs(reloaded.duration - source.duration) <= 1e-4, (
        f"duration {reloaded.duration} != {source.duration}")
    assert reloaded.bone_names == source.bone_names, "bone names differ"
    # A source whose binding leaves transformTrackToBoneIndices empty means
    # the identity mapping, which is what write_skyrim_animation writes out.
    expected_indices = (source.track_to_bone_indices
                        or list(range(source.num_tracks)))
    assert reloaded.track_to_bone_indices == expected_indices, (
        "track_to_bone_indices differ")
    assert reloaded.original_skeleton_name == source.original_skeleton_name, (
        "original_skeleton_name differs")
    assert reloaded.blend_hint == source.blend_hint, "blend_hint differs"
    max_t, max_r = round_trip_error(source, reloaded)
    assert max_t <= 0.01, f"translation error {max_t} > 0.01"
    assert max_r <= 0.5, f"rotation error {max_r} deg > 0.5"
    return reloaded, max_t, max_r


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def convert_tree(src: Path, dst: Path, verify: bool = True) -> List[dict]:
    """Convert a file or the ``.hkx`` files at the root of a directory.

    Subdirectories are not walked. Returns one record per converted file.
    """
    src = Path(src)
    dst = Path(dst)
    if src.is_file():
        sources = [src]
        root = src.parent
    else:
        sources = sorted((p for p in src.iterdir()
                          if p.is_file() and p.suffix.lower() == ".hkx"),
                         key=lambda p: p.name)
        root = src
    out = []
    for path in sources:
        target = dst / path.name
        try:
            anim = convert_to_spline(path, target)
        except ValueError as exc:
            out.append({"source": str(path), "skipped": str(exc)})
            continue
        record = {
            "source": str(path),
            "output": str(target),
            "frames": anim.num_frames,
            "tracks": anim.num_tracks,
            "duration": round(anim.duration, 6),
            "sha256": sha256(target),
        }
        if verify:
            _, max_t, max_r = verify_round_trip(path, target, anim)
            record["maxTranslationDelta"] = max_t
            record["maxRotationDeltaDeg"] = max_r
        out.append(record)
    return out


def main(argv: Optional[Iterable[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--src", type=Path, required=True,
                    help="an interleaved .hkx file, or a directory of them")
    ap.add_argument("--dst", type=Path, required=True, help="output directory")
    ap.add_argument("--no-verify", action="store_true",
                    help="skip the reload/round-trip check")
    ap.add_argument("--json", type=Path, help="write the records as JSON here")
    args = ap.parse_args(list(argv) if argv is not None else None)

    records = convert_tree(args.src, args.dst, verify=not args.no_verify)
    max_t = max((r.get("maxTranslationDelta", 0.0) for r in records), default=0.0)
    max_r = max((r.get("maxRotationDeltaDeg", 0.0) for r in records), default=0.0)
    for r in records:
        if "skipped" in r:
            print(f"skip {Path(r['source']).name}: {r['skipped']}")
            continue
        print(f"{Path(r['source']).name}: {r['frames']} frames x {r['tracks']} "
              f"tracks, {r['duration']:.4f}s, dt {r.get('maxTranslationDelta', 0):.5f} "
              f"dr {r.get('maxRotationDeltaDeg', 0):.4f} deg  {r['sha256'][:12]}")
    converted = [r for r in records if "output" in r]
    print(f"converted {len(converted)}/{len(records)}; "
          f"max translation {max_t:.5f}, max rotation {max_r:.4f} deg")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(records, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
