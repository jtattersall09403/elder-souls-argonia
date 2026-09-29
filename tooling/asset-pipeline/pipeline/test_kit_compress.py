"""Gates on kit compression (owner 2026-09-18, pulled forward from Phase 14).

1. Every kit under apps/world-studio/public/kits/ ships KTX2 textures and
   meshopt geometry with a `compression` record in its manifest — an
   uncompressed kit cannot ship silently. First shown failing on all 21
   pre-compression kits (PNG images, no record) on 2026-09-18.
2. The three kits every studio start downloads (flora, underwater,
   groundcover) stay under a byte budget, so the cold-start payload cannot
   creep back: 118.9 MB before compression, 45.6 MB after.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from .kit_compress import (DEFAULT_POLICY, PUBLIC_KITS, SIDECAR_EXEMPT, _sha256, check,
                           gltfpack_args, policy_for, publish_sidecars, remember,
                           reusable_record, sidecar_problems)

STARTUP_KITS = ("flora-province-v1", "underwater-v1", "groundcover-province-v1")
STARTUP_BUDGET_BYTES = 52_000_000  # measured 45.6 MB compressed; ~14 % headroom


def _published() -> list[Path]:
    return sorted(PUBLIC_KITS.glob("*.glb"))


def test_every_published_kit_is_compressed_and_recorded():
    problems = [p for glb in _published() for p in check(glb.stem)]
    assert not problems, "\n".join(problems)


def test_startup_payload_within_budget():
    sizes = {k: (PUBLIC_KITS / f"{k}.glb").stat().st_size for k in STARTUP_KITS}
    total = sum(sizes.values())
    assert total <= STARTUP_BUDGET_BYTES, (
        f"startup kits total {total / 1e6:.1f} MB > {STARTUP_BUDGET_BYTES / 1e6:.0f} MB: "
        + ", ".join(f"{k} {v / 1e6:.1f} MB" for k, v in sizes.items()))


def test_compression_record_matches_shipped_bytes():
    for glb in _published():
        manifest = json.loads(glb.with_suffix(".kit.json").read_text())
        record = manifest.get("compression") or {}
        if record.get("enabled", True) and "bytesAfter" in record:
            assert record["bytesAfter"] == glb.stat().st_size, glb.name


def test_gltfpack_args_keep_what_the_runtime_reads():
    args = gltfpack_args(DEFAULT_POLICY)
    for flag in ("-kn", "-km", "-ke", "-vpf", "-vtf", "-cc", "-tc"):
        assert flag in args
    assert args[args.index("-tu") + 1] == "color,normal,attrib"


def test_policy_validation():
    assert policy_for({"id": "x"})["color"] == "uastc"
    assert policy_for({"id": "x", "compression": {"color": "etc1s"}})["color"] == "etc1s"
    assert policy_for({"id": "x", "compression": False}) == {"enabled": False}
    with pytest.raises(ValueError):
        policy_for({"id": "x", "compression": {"normal": "png"}})


def test_the_three_sidecars_are_published_beside_the_kit(tmp_path):
    """The compile and the export read connectors/footprints/interiors from the
    SHIPPED build; a kit published without them cannot be snapped, footed or
    entered (16h item 6). First shown failing on 19 published kits, none of
    which carried a sidecar on 2026-09-22."""
    raw, public = tmp_path / "raw", tmp_path / "public"
    raw.mkdir()
    for part in ("connectors", "footprints", "interiors"):
        (raw / f"kit-a.{part}.json").write_text(json.dumps({"kit": "kit-a", part: []}))
    written = publish_sidecars("kit-a", raw, public)
    assert sorted(written) == ["connectors", "footprints", "interiors"]
    for part in written:
        published = public / f"kit-a.{part}.json"
        assert published.is_file()
        assert oct(published.stat().st_mode)[-3:] == "644"
    assert sidecar_problems("kit-a", public) == []


def test_a_kit_missing_a_measurement_is_a_hard_error_not_a_silent_gap(tmp_path):
    raw, public = tmp_path / "raw", tmp_path / "public"
    raw.mkdir()
    (raw / "kit-a.connectors.json").write_text("{}")
    with pytest.raises(FileNotFoundError, match="footprints, interiors"):
        publish_sidecars("kit-a", raw, public)
    assert sidecar_problems("kit-a", public)


def test_an_atlas_kit_is_exempt_by_name_with_its_reason(tmp_path):
    """Snap edges, footprints and interiors say nothing about instanced flora;
    the exemption is written down, never a silent skip."""
    exempt = sorted(SIDECAR_EXEMPT)
    assert exempt == ["flora-province-v1", "groundcover-province-v1"]
    for kit_id, reason in SIDECAR_EXEMPT.items():
        assert reason.strip()
        assert publish_sidecars(kit_id, tmp_path, tmp_path) == {}
        assert sidecar_problems(kit_id, tmp_path) == []


def test_an_unchanged_input_reuses_the_record_and_a_change_does_not(tmp_path):
    """S2a: gltfpack is skipped only when the input key matches the last run's
    and the published GLB is still the bytes that run wrote."""
    dst = tmp_path / "k.glb"
    dst.write_bytes(b"compressed bytes")
    record = {"sha256": _sha256(dst), "bytesAfter": 16, "sidecarBytes": {"x": 1},
              "sidecarsExempt": "why"}
    published = tmp_path / "k.kit.json"
    published.write_text(json.dumps({"compression": record}))
    cache = tmp_path / "cache"
    remember("k", "key-1", record, cache)
    got = reusable_record("k", "key-1", dst, published, cache)
    assert got == {"sha256": record["sha256"], "bytesAfter": 16}
    assert reusable_record("k", "key-2", dst, published, cache) is None
    dst.write_bytes(b"someone else's bytes")
    assert reusable_record("k", "key-1", dst, published, cache) is None
    assert reusable_record("other", "key-1", dst, published, cache) is None


def test_parts_problems_name_a_missing_folder_another_glb_and_a_missing_file(tmp_path, monkeypatch):
    """A kit's parts folder is current only when its index names the published
    GLB's sha256 and every listed file exists at its size (16k walk 4)."""
    import hashlib
    from . import kit_compress
    monkeypatch.setattr(kit_compress, "PUBLIC_KITS", tmp_path)
    monkeypatch.setattr(kit_compress, "parts_scope", lambda: {"k"})
    monkeypatch.setattr(kit_compress, "parts_drawn", lambda kit: {"x:a"})
    (tmp_path / "k.glb").write_bytes(b"glb-bytes")
    assert "no parts folder" in kit_compress.parts_problems("k")[0]
    parts = tmp_path / "k" / "parts"
    (parts / "tex").mkdir(parents=True)
    (parts / "a.glb").write_bytes(b"12345")
    (parts / "tex" / "abcd.ktx2").write_bytes(b"t")
    index = {"source": {"sha256": "0" * 64},
             "assets": {"x:a": {"file": "a.glb", "bytes": 5, "textures": ["abcd"]}}}
    (parts / "index.json").write_text(json.dumps(index))
    assert "cut from another GLB" in kit_compress.parts_problems("k")[0]
    index["source"]["sha256"] = hashlib.sha256(b"glb-bytes").hexdigest()
    (parts / "index.json").write_text(json.dumps(index))
    assert kit_compress.parts_problems("k") == []
    (parts / "tex" / "abcd.ktx2").unlink()
    assert "tex/abcd.ktx2" in kit_compress.parts_problems("k")[0]


def test_parts_cover_exactly_the_assets_the_cells_draw(tmp_path, monkeypatch):
    """Review 5536a1d9: parts are cut only for the assets a cell draws
    (placements, stand-ins, swing doors), so an index that lacks a drawn
    asset or holds an undrawn one is stale."""
    import hashlib
    from . import kit_compress
    cells = tmp_path / "interiors"
    cells.mkdir()
    (cells / "C.json").write_text(json.dumps({
        "kits": {"k": {}}, "placements": [{"kit": "k", "assetId": "x:a"}],
        "substitutions": [{"kit": "k", "standInAsset": "x:b"}],
        "doors": [{"doorType": "swing", "kit": "k", "assetId": "x:door"}, {"doorType": "load"}]}))
    monkeypatch.setattr(kit_compress, "PUBLIC_INTERIORS", cells)
    monkeypatch.setattr(kit_compress, "PUBLIC_KITS", tmp_path)
    assert kit_compress.parts_drawn("k") == {"x:a", "x:b", "x:door"}
    (tmp_path / "k.glb").write_bytes(b"g")
    parts = tmp_path / "k" / "parts"
    parts.mkdir(parents=True)
    rows = {a: {"file": f"{i}.glb", "bytes": 1, "textures": []} for i, a in enumerate(["x:a", "x:b", "x:extra"])}
    for row in rows.values():
        (parts / row["file"]).write_bytes(b"1")
    (parts / "index.json").write_text(json.dumps(
        {"source": {"sha256": hashlib.sha256(b"g").hexdigest()}, "assets": rows}))
    problem = kit_compress.parts_problems("k")[0]
    assert "x:door" in problem and "x:extra" in problem


def test_parts_scope_is_the_kits_published_cells_name(tmp_path, monkeypatch):
    """Parts ship only for kits an interior cell bundle names (16k walk 4, lane
    PARTS): an unscoped kit needs no parts folder, and one it still has fails
    the check, because parts are a second copy that ships to Pages."""
    from . import kit_compress
    cells = tmp_path / "interiors"
    cells.mkdir()
    (cells / "C.json").write_text(json.dumps({"kits": {"in-cell": {"id": "in-cell"}}}))
    monkeypatch.setattr(kit_compress, "PUBLIC_INTERIORS", cells)
    monkeypatch.setattr(kit_compress, "PUBLIC_KITS", tmp_path)
    assert kit_compress.parts_scope() == {"in-cell"}
    (tmp_path / "exterior-only.glb").write_bytes(b"g")
    assert kit_compress.parts_problems("exterior-only") == []
    (tmp_path / "exterior-only" / "parts").mkdir(parents=True)
    assert "named by no interior cell" in kit_compress.parts_problems("exterior-only")[0]
