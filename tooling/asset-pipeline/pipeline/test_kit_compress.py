"""Gates on kit compression (owner 2026-09-18, pulled forward from Phase 14).

1. Every kit under apps/world-studio/public/kits/ ships as KTX2/meshopt
   parts (decision 0120) with a `compression` record in its manifest — an
   uncompressed kit cannot ship silently. First shown failing on all 21
   pre-compression kits (PNG images, no record) on 2026-09-18.
2. The three kits every studio start downloads (flora, underwater,
   groundcover) stay under a byte budget, so the cold-start payload cannot
   creep back: 118.9 MB before compression, 45.6 MB after. Measured over the
   published parts: every part GLB plus every distinct pool texture they name.
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


def _published() -> list[str]:
    return sorted(p.parent.parent.name for p in PUBLIC_KITS.glob("*/parts/index.json"))


def startup_bytes(kits=STARTUP_KITS, public_dir: Path = PUBLIC_KITS) -> dict[str, int]:
    """Bytes a cold start fetches per startup kit: its part GLBs, plus each
    pool texture once, charged to the first kit that names it."""
    seen: set[str] = set()
    sizes: dict[str, int] = {}
    for kit in kits:
        index = json.loads((public_dir / kit / "parts" / "index.json").read_text())
        total = 0
        for row in index["assets"].values():
            total += row["bytes"]
            for h in row["textures"]:
                if h not in seen:
                    seen.add(h)
                    total += (public_dir / "tex" / f"{h}.ktx2").stat().st_size
        sizes[kit] = total
    return sizes


def test_every_published_kit_is_compressed_and_recorded():
    kits = _published()
    assert len(kits) == len(list(PUBLIC_KITS.glob("*.kit.json"))), "a published manifest has no parts"
    problems = [p for kit in kits for p in check(kit)]
    assert not problems, "\n".join(problems)


def test_no_whole_kit_glb_ships():
    """Decision 0120: kits ship only as parts."""
    assert sorted(p.name for p in PUBLIC_KITS.glob("*.glb")) == []


def test_startup_payload_within_budget():
    sizes = startup_bytes()
    total = sum(sizes.values())
    assert total <= STARTUP_BUDGET_BYTES, (
        f"startup kits total {total / 1e6:.1f} MB > {STARTUP_BUDGET_BYTES / 1e6:.0f} MB: "
        + ", ".join(f"{k} {v / 1e6:.1f} MB" for k, v in sizes.items()))


def test_startup_budget_counts_a_shared_texture_once(tmp_path):
    for kit, tex in (("a", ["t1", "t2"]), ("b", ["t2"])):
        (tmp_path / kit / "parts").mkdir(parents=True)
        (tmp_path / kit / "parts" / "index.json").write_text(json.dumps(
            {"assets": {f"{kit}:x": {"bytes": 10, "textures": tex}}}))
    (tmp_path / "tex").mkdir()
    for h in ("t1", "t2"):
        (tmp_path / "tex" / f"{h}.ktx2").write_bytes(b"x" * 100)
    assert startup_bytes(("a", "b"), tmp_path) == {"a": 210, "b": 10}


def test_compression_record_matches_shipped_parts():
    for kit in _published():
        record = json.loads((PUBLIC_KITS / f"{kit}.kit.json").read_text()).get("compression") or {}
        index = json.loads((PUBLIC_KITS / kit / "parts" / "index.json").read_text())
        assert record.get("sha256") == index["packed"]["sha256"], kit
        if record.get("enabled", True):
            assert record["bytesAfter"] == index["packed"]["bytes"], kit


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


def _write_parts(public: Path, kit: str, packed_sha: str, source_sha: str, assets: dict,
                 schema: int = 4) -> None:
    (public / kit / "parts").mkdir(parents=True, exist_ok=True)
    (public / kit / "parts" / "index.json").write_text(json.dumps(
        {"schemaVersion": schema, "source": {"sha256": source_sha},
         "packed": {"sha256": packed_sha}, "assets": assets}))


def test_an_unchanged_input_reuses_the_record_and_a_change_does_not(tmp_path):
    """gltfpack and the cut are skipped only when the input key matches the
    last run's and the parts index still names the packed GLB that run wrote."""
    record = {"sha256": "p" * 64, "bytesAfter": 16, "sidecarBytes": {"x": 1},
              "sidecarsExempt": "why"}
    (tmp_path / "k.kit.json").write_text(json.dumps({"compression": record}))
    _write_parts(tmp_path, "k", "p" * 64, "r" * 64, {})
    cache = tmp_path / "cache"
    remember("k", "key-1", record, cache)
    got = reusable_record("k", "key-1", cache, tmp_path)
    assert got == {"sha256": record["sha256"], "bytesAfter": 16}
    assert reusable_record("k", "key-2", cache, tmp_path) is None
    _write_parts(tmp_path, "k", "q" * 64, "r" * 64, {})
    assert reusable_record("k", "key-1", cache, tmp_path) is None
    assert reusable_record("other", "key-1", cache, tmp_path) is None


def test_parts_problems_fail_a_stale_or_incomplete_parts_folder(tmp_path):
    """Decision 0120 schema 4: a kit's parts are current only when the index
    names the packed GLB the manifest records, the raw build it was cut from,
    a part for every manifest asset, and every listed file at its size; the
    pool holds no texture no index names. Each branch is made to fail."""
    from . import kit_compress
    raw = tmp_path / "k.raw.glb"
    raw.write_bytes(b"raw-bytes")
    (tmp_path / "k.kit.json").write_text(json.dumps(
        {"assets": [{"id": "x:a"}], "compression": {"sha256": "p" * 64}}))
    assert "no parts index" in kit_compress.parts_problems("k", raw, tmp_path)[0]
    parts = tmp_path / "k" / "parts"
    parts.mkdir(parents=True)
    (tmp_path / "tex").mkdir()
    (parts / "a.glb").write_bytes(b"12345")
    (tmp_path / "tex" / "abcd.ktx2").write_bytes(b"t")
    rows = {"x:a": {"file": "a.glb", "bytes": 5, "textures": ["abcd"]}}
    _write_parts(tmp_path, "k", "p" * 64, _sha256(raw), rows, schema=3)
    assert "schemaVersion 3" in kit_compress.parts_problems("k", raw, tmp_path)[0]
    _write_parts(tmp_path, "k", "q" * 64, _sha256(raw), rows)
    assert "another packed GLB" in kit_compress.parts_problems("k", raw, tmp_path)[0]
    _write_parts(tmp_path, "k", "p" * 64, "0" * 64, rows)
    assert "another raw build" in kit_compress.parts_problems("k", raw, tmp_path)[0]
    assert kit_compress.parts_problems("k", None, tmp_path) == []  # no raw on this machine
    _write_parts(tmp_path, "k", "p" * 64, _sha256(raw), {})
    assert "lack manifest asset" in kit_compress.parts_problems("k", raw, tmp_path)[0]
    _write_parts(tmp_path, "k", "p" * 64, _sha256(raw), rows)
    assert kit_compress.parts_problems("k", raw, tmp_path) == []
    (tmp_path / "tex" / "abcd.ktx2").unlink()
    assert "tex/abcd.ktx2" in kit_compress.parts_problems("k", raw, tmp_path)[0]


def test_pool_problems_name_an_orphan_texture(tmp_path, monkeypatch):
    from . import kit_compress
    monkeypatch.setattr(kit_compress, "PUBLIC_KITS", tmp_path)
    _write_parts(tmp_path, "k", "p", "r", {"x:a": {"file": "a.glb", "bytes": 1, "textures": ["abcd"]}})
    (tmp_path / "tex").mkdir()
    (tmp_path / "tex" / "abcd.ktx2").write_bytes(b"t")
    assert kit_compress.pool_problems() == []
    (tmp_path / "tex" / "orphan.ktx2").write_bytes(b"o")
    assert "orphan.ktx2" in kit_compress.pool_problems()[0]


def test_published_problems_refuse_a_manifest_without_a_compression_record(tmp_path):
    from . import kit_compress
    assert "no published manifest" in kit_compress.published_problems("k", tmp_path)[0]
    (tmp_path / "k.kit.json").write_text(json.dumps({"assets": []}))
    assert "no `compression` record" in kit_compress.published_problems("k", tmp_path)[0]
    (tmp_path / "k.kit.json").write_text(json.dumps({"compression": {
        "sha256": "p", "textureContainer": "png", "geometry": "EXT_meshopt_compression"}}))
    assert "no KTX2" in kit_compress.published_problems("k", tmp_path)[0]


def test_the_writer_schema_matches(tmp_path):
    from . import kit_compress
    js = kit_compress.PARTS_WRITER.read_text()
    assert f"PARTS_SCHEMA_VERSION = {kit_compress.PARTS_SCHEMA_VERSION};" in js


def test_published_gltf_reads_the_parts_as_one_kit():
    """`published_gltf` (the shipped-kit readers' view): one scene root per
    part, its asset id, and every mesh, material and texture index in range."""
    from .kit_compress import parts_index_path, published_gltf
    for kit in ("camp-v1", "settlement-mud-v1"):
        doc = published_gltf(kit)
        index = json.loads(parts_index_path(kit).read_text())["assets"]
        roots = [doc["nodes"][r]["extras"]["assetId"] for r in doc["scenes"][0]["nodes"]]
        assert roots == list(index)
        for p in (p for m in doc["meshes"] for p in m["primitives"]):
            assert p["material"] < len(doc["materials"])
            assert all(a < len(doc["accessors"]) for a in [*p["attributes"].values(), p.get("indices", 0)])
        refs = [v["index"] for m in doc["materials"] for k, v in m.get("pbrMetallicRoughness", {}).items()
                if k.endswith("Texture")]
        assert refs and all(r < len(doc["textures"]) for r in refs)
