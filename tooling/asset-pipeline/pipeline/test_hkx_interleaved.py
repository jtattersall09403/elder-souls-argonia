"""Tests for the interleaved-uncompressed HKX reader.

The decoding tests build a minimal packfile in memory so they run on CI, which
has no asset vault. The assertions that need Animated Armoury are skipped
without it.
"""

from __future__ import annotations

import struct
from pathlib import Path

import pytest

from pipeline import hkx_interleaved as hi

KATANA_DIR = (
    Path.home()
    / "workspace/elder-souls-dev/elder-scrolls-asset-pipeline/skyrim-source"
    / "mod-sources/extracted/animated-armoury-2.3/AnimatedArmouryDAR SSE"
    / "Data/Meshes/actors/character/animations/DynamicAnimationReplacer"
    / "_CustomConditions/20"
)
HAVE_VAULT = KATANA_DIR.is_dir()

try:
    hi.hkx_dir()
    HAVE_PYNIFLY = True
except FileNotFoundError:
    HAVE_PYNIFLY = False

needs_pynifly = pytest.mark.skipif(
    not HAVE_PYNIFLY, reason="PyNifly hkx modules not installed")

PTR = 8
ARR = PTR + 8
#: Field offsets on hkaInterleavedUncompressedAnimation for 8-byte pointers.
O_TYPE = 2 * PTR
O_ANN = O_TYPE + 16 + PTR
O_TRANSFORMS = O_ANN + ARR
O_FLOATS = O_TRANSFORMS + ARR
ANIM_SIZE = O_FLOATS + ARR


def _qs(t, r, s) -> bytes:
    return (struct.pack("<3f", *t) + b"\0" * 4
            + struct.pack("<4f", *r)
            + struct.pack("<3f", *s) + b"\0" * 4)


def _section_header(name: str, start: int, *offs: int) -> bytes:
    out = name.encode().ljust(16, b"\0")
    out += struct.pack("<I", 0xFF)
    out += struct.pack("<I", start)
    for o in offs:
        out += struct.pack("<I", o)
    return out.ljust(0x30, b"\0")


def build_minimal(num_tracks: int = 2, num_frames: int = 3,
                  duration: float = 1.0, bone_names=("A", "B"),
                  skeleton: str = "TestSkel", blend_hint: int = 0) -> bytes:
    """Hand-build an interleaved packfile: one animation and one binding."""
    classnames = [
        "hkaInterleavedUncompressedAnimation",
        "hkaAnimationBinding",
    ]
    cn_start = 0x40 + 3 * 0x30
    cn = b""
    name_off = {}
    for n in classnames:
        cn += struct.pack("<IB", 0x12345678, 0x09)
        name_off[n] = len(cn)
        cn += n.encode() + b"\0"
    cn = cn.ljust((len(cn) + 15) & ~15, b"\xff")

    # __data__ layout, all offsets relative to the section start.
    local = []          # (src_rel, dst_rel)
    anim_rel = 0
    bind_rel = ANIM_SIZE
    BIND_IDX = 2 * PTR + 2 * PTR
    bind_size = BIND_IDX + 2 * ARR + 16
    blob_rel = bind_rel + bind_size

    blob = b""

    def emit(payload: bytes) -> int:
        nonlocal blob
        pad = (-len(blob)) % 16
        blob += b"\0" * pad
        at = blob_rel + len(blob)
        blob += payload
        return at

    # Frame-major transforms: the value encodes (frame, track).
    transforms = b""
    for f in range(num_frames):
        for t in range(num_tracks):
            transforms += _qs((f, t, f + t), (0.0, 0.0, 0.0, 1.0), (1.0, 1.0, 1.0))
    tr_at = emit(transforms)
    local.append((anim_rel + O_TRANSFORMS, tr_at))

    # Annotation tracks: one per track, name pointer only, no events.
    ann_stride = PTR + ARR
    ann_at = emit(b"\0" * (ann_stride * num_tracks))
    local.append((anim_rel + O_ANN, ann_at))
    for i, name in enumerate(bone_names):
        at = emit(name.encode() + b"\0")
        local.append((ann_at + i * ann_stride, at))

    skel_at = emit(skeleton.encode() + b"\0")
    local.append((bind_rel + 2 * PTR, skel_at))
    idx_at = emit(struct.pack(f"<{num_tracks}h", *range(num_tracks)))
    local.append((bind_rel + BIND_IDX, idx_at))

    obj = bytearray(blob_rel + len(blob))
    struct.pack_into("<I", obj, anim_rel + O_TYPE, 1)
    struct.pack_into("<f", obj, anim_rel + O_TYPE + 4, duration)
    struct.pack_into("<I", obj, anim_rel + O_TYPE + 8, num_tracks)
    struct.pack_into("<I", obj, anim_rel + O_TYPE + 12, 0)
    struct.pack_into("<I", obj, anim_rel + O_ANN + PTR, num_tracks)
    struct.pack_into("<I", obj, anim_rel + O_TRANSFORMS + PTR,
                     num_tracks * num_frames)
    struct.pack_into("<I", obj, bind_rel + BIND_IDX + PTR, num_tracks)
    struct.pack_into("<I", obj, bind_rel + BIND_IDX + 2 * ARR, blend_hint)
    obj[blob_rel:blob_rel + len(blob)] = blob

    local_tbl = b"".join(struct.pack("<II", s, d) for s, d in sorted(local))
    local_tbl = local_tbl.ljust((len(local_tbl) + 15) & ~15, b"\xff")
    global_tbl = b"\xff" * 16
    virt = b"".join(
        struct.pack("<III", rel, 2, name_off[cls])
        for rel, cls in ((anim_rel, "hkaInterleavedUncompressedAnimation"),
                         (bind_rel, "hkaAnimationBinding")))
    virt = virt.ljust((len(virt) + 15) & ~15, b"\xff")

    data_start = cn_start + len(cn)
    obj_len = len(obj)
    local_abs = obj_len
    global_abs = local_abs + len(local_tbl)
    virt_abs = global_abs + len(global_tbl)
    end = virt_abs + len(virt)

    hdr = bytearray(0x40)
    hdr[0:4] = hi.load_pynifly()[1]._HKX_MAGIC
    struct.pack_into("<I", hdr, 0x0C, 8)          # version 8 = hk_2010
    hdr[0x10] = PTR
    struct.pack_into("<I", hdr, 0x14, 1)          # little endian
    struct.pack_into("<I", hdr, 0x18, 0)
    struct.pack_into("<I", hdr, 0x1C, 3)          # section count
    struct.pack_into("<I", hdr, 0x20, 0)
    struct.pack_into("<I", hdr, 0x24, name_off.get("hkRootLevelContainer", 0))
    hdr[0x28:0x38] = b"hk_2010.2.0-r1".ljust(16, b"\0")[:16]

    sec0 = _section_header("__classnames__", cn_start, len(cn), len(cn),
                           len(cn), len(cn), len(cn), len(cn))
    sec1 = _section_header("__types__", data_start, 0, 0, 0, 0, 0, 0)
    sec2 = _section_header("__data__", data_start, local_abs, global_abs,
                           virt_abs, end, end, end)
    return bytes(hdr) + sec0 + sec1 + sec2 + cn + bytes(obj) + local_tbl \
        + global_tbl + virt


@needs_pynifly
def test_parses_minimal_packfile():
    anim = hi.parse_interleaved(build_minimal())
    assert anim is not None
    assert anim.num_tracks == 2
    assert anim.num_frames == 3
    assert anim.duration == pytest.approx(1.0)
    assert anim.frame_duration == pytest.approx(0.5)
    assert anim.bone_names == ["A", "B"]
    assert anim.original_skeleton_name == "TestSkel"
    assert anim.track_to_bone_indices == [0, 1]


@needs_pynifly
def test_transforms_are_read_frame_major():
    anim = hi.parse_interleaved(build_minimal())
    # build_minimal writes translation (frame, track, frame+track).
    for t in range(2):
        for f in range(3):
            assert anim.tracks[t].translations[f] == pytest.approx([f, t, f + t])
            assert anim.tracks[t].rotations[f] == pytest.approx([0, 0, 0, 1])
            assert anim.tracks[t].scales[f] == pytest.approx([1, 1, 1])


@needs_pynifly
def test_rejects_ragged_transform_count():
    data = bytearray(build_minimal())
    # Claim one transform too many for a whole number of frames.
    off = hi.load_pynifly()[1]._parse_hkx_sections(bytes(data))["__data__"]["offset"]
    struct.pack_into("<I", data, off + O_TRANSFORMS + PTR, 7)
    with pytest.raises(ValueError):
        hi.parse_interleaved(bytes(data))


@needs_pynifly
def test_round_trip_through_convert(tmp_path):
    src = tmp_path / "min.hkx"
    src.write_bytes(build_minimal(num_frames=8, duration=1.0))
    dst = tmp_path / "out" / "min.hkx"
    anim = hi.convert_to_spline(src, dst)
    reloaded, max_t, max_r = hi.verify_round_trip(src, dst, anim)
    assert reloaded.num_frames == 8
    assert max_t <= 0.01
    assert max_r <= 0.5


@needs_pynifly
def test_convert_is_deterministic(tmp_path):
    src = tmp_path / "min.hkx"
    src.write_bytes(build_minimal())
    a, b = tmp_path / "a" / "m.hkx", tmp_path / "b" / "m.hkx"
    hi.convert_to_spline(src, a)
    hi.convert_to_spline(src, b)
    assert a.read_bytes() == b.read_bytes()


@needs_pynifly
@pytest.mark.skipif(not HAVE_VAULT, reason="Animated Armoury not in the vault")
def test_katana_attackright_converts(tmp_path):
    src = KATANA_DIR / "1hm_attackright.hkx"
    dst = tmp_path / "1hm_attackright.hkx"
    anim = hi.convert_to_spline(src, dst)
    assert anim.num_tracks >= 99
    reloaded, max_t, max_r = hi.verify_round_trip(src, dst, anim)
    assert reloaded.num_tracks == anim.num_tracks
    assert reloaded.num_frames == anim.num_frames
