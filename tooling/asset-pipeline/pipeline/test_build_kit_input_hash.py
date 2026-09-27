"""The build_kit input-hash skip: the digest moves with a config byte, a source
mesh and the code version, and holds still otherwise (no Blender)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from . import build_kit
from .build_kit import changed_inputs, inputs_digest, inputs_stamp_path, unchanged_outputs, write_inputs_stamp


@pytest.fixture()
def inputs(tmp_path: Path) -> dict[str, Path]:
    files = {
        "config": tmp_path / "kit.json",
        "mesh": tmp_path / "data-root" / "meshes" / "hut.nif",
        "code": tmp_path / "build_kit.py",
    }
    files["mesh"].parent.mkdir(parents=True)
    files["config"].write_text('{"id": "k", "assets": []}')
    files["mesh"].write_bytes(b"NIF\x00" * 64)
    files["code"].write_text("VERSION = 1\n")
    return files


def _digest(files: dict[str, Path], options: dict | None = None) -> str:
    return inputs_digest(list(files.items()), options or {"plan": {"kit": "k"}})


def test_the_digest_is_stable_when_nothing_changes(inputs):
    first = _digest(inputs)
    assert _digest(inputs) == first
    # a re-extraction rewrites the same bytes with a new mtime: content wins
    inputs["mesh"].write_bytes(inputs["mesh"].read_bytes())
    assert _digest(inputs) == first
    # the order files are listed in does not matter
    assert inputs_digest(list(reversed(list(inputs.items()))),
                         {"plan": {"kit": "k"}}) == first


@pytest.mark.parametrize("name, content", [
    ("config", b'{"id": "k", "assets": [1]}'),
    ("mesh", b"NIF\x01" * 64),
    ("code", b"VERSION = 2\n"),
])
def test_the_digest_moves_with_each_input(inputs, name, content):
    before = _digest(inputs)
    inputs[name].write_bytes(content)
    assert _digest(inputs) != before


def test_the_digest_moves_with_the_options_and_a_missing_file(inputs):
    before = _digest(inputs)
    assert _digest(inputs, {"plan": {"kit": "k"}, "vault": "/v"}) != before
    inputs["mesh"].unlink()
    assert _digest(inputs) != before


def test_a_skip_needs_the_stamp_and_every_output(tmp_path, monkeypatch):
    from . import kit_compress
    monkeypatch.setattr(kit_compress, "PUBLIC_KITS", tmp_path / "public")
    glb = tmp_path / "k.glb"
    glb.write_bytes(b"glTF")
    # the manifest on disk never carries the sidecar list: the stamp does
    glb.with_suffix(".kit.json").write_text(json.dumps({"assets": []}))
    stamp = inputs_stamp_path(glb)
    assert stamp.name == "k.inputs.sha256"
    assert unchanged_outputs(glb, "abc") is None          # no stamp
    stamp.write_text("abc\n")
    assert unchanged_outputs(glb, "abc") is None          # a stamp without the sidecar line
    (tmp_path / "k.footprints.json").write_text("{}")
    write_inputs_stamp(glb, {"x": "1"}, ["k.footprints.json"])
    digest = stamp.read_text().split("\n", 1)[0]
    assert unchanged_outputs(glb, digest) == {"assets": [], "sidecars": ["k.footprints.json"]}
    (tmp_path / "k.footprints.json").unlink()
    assert unchanged_outputs(glb, digest) is None         # sidecar missing (deleted since the build)
    (tmp_path / "k.footprints.json").write_text("{}")
    assert changed_inputs(glb, {"x": "1"}) == []          # the sidecar line is not an input
    assert unchanged_outputs(glb, "abd") is None          # inputs changed
    glb.unlink()
    assert unchanged_outputs(glb, digest) is None         # output gone


def test_the_code_version_covers_the_blender_half():
    names = {p.relative_to(build_kit.PIPELINE_DIR).as_posix()
             for p in build_kit.KIT_CODE_FILES}
    assert {"build_kit.py", "blender/build_kit.py"} <= names
    assert all(p.is_file() for p in build_kit.KIT_CODE_FILES)
    assert all(p.is_file() for p in build_kit.KIT_RECORD_FILES)


def test_the_stamp_lists_which_inputs_moved(tmp_path, inputs):
    glb = tmp_path / "k.glb"
    hashes = build_kit.input_hashes(list(inputs.items()), {"plan": {}})
    assert build_kit.changed_inputs(glb, hashes) == sorted(hashes)   # no stamp
    build_kit.write_inputs_stamp(glb, hashes)
    assert inputs_stamp_path(glb).read_text().split("\n", 1)[0] == build_kit.digest_of(hashes)
    assert build_kit.changed_inputs(glb, hashes) == []
    inputs["mesh"].write_bytes(b"other")
    moved = build_kit.input_hashes(list(inputs.items()), {"plan": {}})
    assert build_kit.changed_inputs(glb, moved) == ["mesh"]


def test_kit_jobs_and_blender_threads_follow_the_slot_share(monkeypatch):
    # method review C1: under job_guard (ES_JOB_CORES) the kit pool stays inside the slot
    monkeypatch.delenv("ES_JOB_CORES", raising=False)
    assert build_kit.slot_cores() == 0 and build_kit.default_kit_jobs() == build_kit.DEFAULT_KIT_JOBS
    monkeypatch.setenv("ES_JOB_CORES", "2")
    assert build_kit.slot_cores() == 2 and build_kit.default_kit_jobs() == min(2, build_kit.DEFAULT_KIT_JOBS)
    monkeypatch.setenv("ES_JOB_CORES", "junk")
    assert build_kit.slot_cores() == 0


def test_a_skip_vouches_for_the_published_outputs(tmp_path, monkeypatch):
    # review 2026-09-27: a restored older published GLB (tracked) must not be
    # kept by a skip; every output's content is in the stamp
    from . import kit_compress
    pub = tmp_path / "public"
    pub.mkdir()
    monkeypatch.setattr(kit_compress, "PUBLIC_KITS", pub)
    raw = tmp_path / "raw"
    raw.mkdir()
    glb = raw / "k.glb"
    glb.write_bytes(b"glTF")
    glb.with_suffix(".kit.json").write_text("{}")
    (pub / "k.glb").write_bytes(b"compressed")
    (raw / "k-cards").mkdir()
    (raw / "k-cards" / "a.png").write_bytes(b"png")
    write_inputs_stamp(glb, {"x": "1"}, [], "k")
    digest = inputs_stamp_path(glb).read_text().split("\n", 1)[0]
    assert unchanged_outputs(glb, digest) is not None
    (pub / "k.glb").write_bytes(b"an older publish")
    assert unchanged_outputs(glb, digest) is None
    write_inputs_stamp(glb, {"x": "1"}, [], "k")
    (raw / "k-cards" / "a.png").unlink()
    assert unchanged_outputs(glb, digest) is None


def test_concurrent_kit_builds_split_the_slot_threads(monkeypatch):
    monkeypatch.setenv("ES_JOB_CORES", "2")
    monkeypatch.delenv("ES_KIT_CONCURRENT", raising=False)
    assert build_kit.blender_threads() == 2
    monkeypatch.setenv("ES_KIT_CONCURRENT", "2")
    assert build_kit.blender_threads() == 1
    monkeypatch.setenv("ES_KIT_CONCURRENT", "3")
    assert build_kit.blender_threads() == 1
    monkeypatch.delenv("ES_JOB_CORES")
    assert build_kit.blender_threads() == 0


def _records_copy(tmp_path, monkeypatch):
    """Scratch copies of the two row-keyed records, wired in wherever this
    version of build_kit reads them (the kit-row view or the whole file)."""
    import shutil
    copies = {}
    for real in (build_kit.PIPELINE_DIR / "config" / "placement-policies.json",
                 build_kit.REPO_ROOT / "world" / "sources" / "placement" / "kit-designed-sink.json"):
        copies[real] = tmp_path / real.name
        shutil.copy(real, copies[real])
    monkeypatch.setattr(build_kit, "KIT_RECORD_FILES",
                        tuple(copies.get(p, p) for p in build_kit.KIT_RECORD_FILES))
    if hasattr(build_kit, "KIT_ROW_RECORDS"):
        monkeypatch.setattr(build_kit, "KIT_ROW_RECORDS",
                            tuple(copies.get(p, p) for p in build_kit.KIT_ROW_RECORDS))
    sink, policies = (copies[p] for p in sorted(copies, key=lambda p: p.name != "kit-designed-sink.json"))
    return sink, policies


def _edit(path, fn):
    doc = json.loads(path.read_text())
    fn(doc)
    path.write_text(json.dumps(doc, indent=1))


def test_an_unrelated_miner_rewrite_does_not_rebuild_the_kit(tmp_path, monkeypatch):
    """Speed lane 3B: a miner rewriting kit-designed-sink.json (its counts and
    another kit's rows) or placement-policies.json (another kit's rows)
    leaves settlement-mud-v1's input digest alone; its own rows and the
    shared policies move it."""
    kit, own = "settlement-mud-v1", "composite:mud/kotm-house-pod"
    other = "vanilla:architecture/docks/dockstrent02"
    sink, policies = _records_copy(tmp_path, monkeypatch)
    data_root = tmp_path / "data-root"
    data_root.mkdir()

    def digest():
        return build_kit.digest_of(build_kit.kit_input_hashes(kit, data_root, {"kit": kit}, tmp_path))
    before = digest()
    _edit(sink, lambda d: d.update(assetsMeasured=d["assetsMeasured"] + 7, refsJoined=1))
    _edit(sink, lambda d: d["assets"][other].update(p50=d["assets"][other]["p50"] + 0.5))
    _edit(policies, lambda d: d["kitPolicies"].update({"docks-v1": {"why": "rewritten"}}))
    _edit(policies, lambda d: d.update(_="prose rewritten"))
    assert digest() == before
    _edit(sink, lambda d: d["assets"][own].update(p50=d["assets"][own]["p50"] + 0.01))
    moved = digest()
    assert moved != before
    _edit(policies, lambda d: d["policies"]["direct"].update(note="a shared policy moved"))
    assert digest() != moved
