"""The boot program-warm list (program_classes.py): deterministic, covers
every material a kit draws, and stays a few KB of the startup payload."""
import json
import struct

from pipeline import program_classes as pc

# The list is fetched at boot beside the manifests (standard 16): its own budget.
PROGRAM_CLASSES_BUDGET_BYTES = 16_000


def _glb(document: dict) -> bytes:
    body = json.dumps(document).encode()
    body += b" " * (-len(body) % 4)
    return (struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(body))
            + struct.pack("<II", len(body), 0x4E4F534A) + body)


def _fixture_kit(root, kit_id, materials, primitives):
    parts = root / kit_id / "parts"
    parts.mkdir(parents=True)
    accessors = [{"type": "VEC3"}, {"type": "VEC4"}, {"type": "VEC2"}]
    doc = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0]}],
           "nodes": [{"mesh": 0}], "meshes": [{"primitives": primitives}],
           "materials": materials, "accessors": accessors}
    (parts / "a.glb").write_bytes(_glb(doc))
    (parts / "index.json").write_text(json.dumps({"assets": {"a": {"file": "a.glb"}}}))


MATERIALS = [
    {"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}},
    {"alphaMode": "MASK", "doubleSided": True, "extras": {"decal": True, "pyn_shader": "x"},
     "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}, "emissiveTexture": {"index": 0}},
    {"alphaMode": "BLEND", "extras": {"additive": True, "gain": 2.5}},
]
PRIMITIVES = [
    {"material": 0, "attributes": {"POSITION": 0, "NORMAL": 0, "TEXCOORD_0": 2}},
    {"material": 0, "attributes": {"POSITION": 0, "NORMAL": 0, "TEXCOORD_0": 2, "COLOR_0": 1}},
    {"material": 1, "attributes": {"POSITION": 0, "NORMAL": 0, "TEXCOORD_0": 2, "COLOR_1": 0}},
    {"material": 2, "attributes": {"POSITION": 0, "COLOR_0": 0}},
    # a second use of the first class: deduplicated, counted
    {"material": 0, "attributes": {"POSITION": 0, "NORMAL": 0, "TEXCOORD_0": 2}},
]


def test_bake_covers_every_material_and_is_deterministic(tmp_path):
    _fixture_kit(tmp_path, "camp-x", MATERIALS, PRIMITIVES)
    _fixture_kit(tmp_path, "flora-x", MATERIALS[:1], PRIMITIVES[:1])
    first = pc.render(pc.bake(tmp_path))
    assert first == pc.render(pc.bake(tmp_path))
    classes = json.loads(first)["classes"]
    kit = [c for c in classes if c["family"] == "kit"]
    assert len(kit) == 4 and sum(c["uses"] for c in kit) == 5
    assert {c["alphaMode"] for c in kit} == {"OPAQUE", "MASK", "BLEND"}
    assert {c["color"] for c in kit} == {0, 3, 4}
    decal = next(c for c in kit if c["extras"].get("decal"))
    # provenance extras dropped, slots named as three names them
    assert decal["extras"] == {"decal": True} and decal["slots"] == ["map", "emissiveMap"]
    additive = next(c for c in kit if c["extras"].get("additive"))
    assert additive["extras"] == {"additive": True} and additive["normal"] is False
    assert [c["family"] for c in classes].count("vegetation") == 1
    assert pc.main(["--public-dir", str(tmp_path)]) == 0
    assert pc.main(["--public-dir", str(tmp_path), "--check"]) == 0


def test_published_list_within_budget():
    path = pc.output_path()
    data = json.loads(path.read_text())
    assert data["schemaVersion"] == pc.SCHEMA_VERSION
    assert path.stat().st_size <= PROGRAM_CLASSES_BUDGET_BYTES
