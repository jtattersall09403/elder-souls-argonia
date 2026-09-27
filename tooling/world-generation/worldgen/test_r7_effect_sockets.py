"""16k r7 rule 3: a burning fire smokes where vanilla smokes it. The compile
emits one `fx:smoke-column` effect per placement whose asset carries a
`fire` effect socket, mounted to the fire at the socket; the export carries
it. Held on Claywater's own brazier."""

import json
from pathlib import Path

from . import compile_settlement as cs
from . import export_settlement_bundle as ex

REPO = Path(__file__).resolve().parents[3]
BLUEPRINT = REPO / "world/sources/blueprints/place.imperial-fringe.claywater-station.json"
BRAZIER = "vanilla:clutter/imperial/impbrazier01"


class _Shelf:
    effect_kit = {"fx:smoke-column": "works-v1"}


def _claywater_brazier() -> dict:
    bp = json.loads(BLUEPRINT.read_text())
    for parcel in bp["blueprint"]["parcels"]:
        for member in parcel.get("assembly") or []:
            if member["asset"] == BRAZIER:
                return {"id": f"{bp['blueprint']['id']}.{parcel['id']}.assembly.{member['id']}",
                        "parcelId": parcel["id"], "objectKind": "assembly", "assetId": BRAZIER,
                        "positionM": [100.0, 30.0, 200.0], "yawDeg": 90.0, "scale": 1.0}
    raise AssertionError("Claywater's blueprint has no brazier")


def test_claywaters_brazier_gets_a_smoke_column_at_its_fire_socket():
    brazier = _claywater_brazier()
    sockets = cs.effect_sockets()
    row = sockets["fire"][BRAZIER]
    errors: list[str] = []
    got = cs.socket_effect_placements("bp", "seed", [brazier], _Shelf(), sockets, errors)
    assert errors == []
    assert len(got) == 1
    fx = got[0]
    assert fx["assetId"] == "fx:smoke-column" and fx["objectKind"] == "effect"
    assert fx["parentPlacementId"] == brazier["id"]
    ox, oy, oz = row["offsetM"]
    # mined (x right, y forward = north, z up) -> the parent's GLB frame
    # (x, up, z south): north is -z (16k fix 2 r4 review, the ruling-2 frame)
    assert fx["mountOffsetM"] == [round(ox, 4), round(oz, 4), round(-oy, 4)]
    assert abs(fx["positionM"][1] - (30.0 + oz)) < 1e-3
    # a second pass over its own output adds nothing (an effect never smokes)
    assert cs.socket_effect_placements("bp", "seed", [brazier, fx], _Shelf(), sockets, []) == got


def test_a_piece_without_a_fire_socket_gets_no_smoke():
    plain = {**_claywater_brazier(), "assetId": "vanilla:clutter/barrel01"}
    assert cs.socket_effect_placements("bp", "s", [plain], _Shelf(), cs.effect_sockets(), []) == []


def test_the_export_carries_the_smoke_column():
    brazier = _claywater_brazier()
    fx, = cs.socket_effect_placements("bp", "seed", [brazier], _Shelf(), cs.effect_sockets(), [])
    fx["provenance"] = {"sourceBlueprintId": "bp"}
    out = ex.effect_contract("bp", fx)
    assert out["kind"] == "effect" and out["assetId"] == "fx:smoke-column"
    assert out["parentPlacementId"] == brazier["id"]
    assert out["mountOffsetM"] == fx["mountOffsetM"]


def test_a_mounted_fires_smoke_turns_with_its_shell():
    """r4 review (CONFIRMED): a member hung `on: parent` carries a yaw
    RELATIVE to its shell; its socket offset turns by the composed world yaw."""
    sockets = {"fire": {BRAZIER: {"offsetM": [1.0, 0.0, 0.5], "n": 3}}}
    shell = {"id": "bp.p.building", "assetId": "x:house", "positionM": [0.0, 0.0, 0.0],
             "yawDeg": 90.0, "scale": 1.0}
    brazier = {"id": "bp.p.assembly.fire", "assetId": BRAZIER, "positionM": [5.0, 1.0, 5.0],
               "yawDeg": 0.0, "scale": 1.0, "parentPlacementId": "bp.p.building"}
    alone = dict(brazier, parentPlacementId=None, yawDeg=90.0)
    got = cs.socket_effect_placements("bp", "s", [shell, brazier], _Shelf(), sockets, [])
    ref = cs.socket_effect_placements("bp", "s", [alone], _Shelf(), sockets, [])
    assert got[0]["positionM"] == ref[0]["positionM"]


def test_a_mounted_glow_piece_is_judged_on_its_world_bearing():
    shell = {"id": "bp.p.building", "parcelId": "p", "assetId": "x:house",
             "positionM": [0.0, 0.0, 0.0], "yawDeg": 90.0}
    window = {"id": "bp.p.assembly.w", "parcelId": "p", "assetId": "x:window",
              "positionM": [0.0, 0.0, 0.0], "yawDeg": 0.0, "parentPlacementId": "bp.p.building"}
    rows = {"x:window": {"glowMaterials": ["g"], "glowFacingsDeg": [0.0]}}
    door = {"id": "d", "parcelId": "p", "thresholdM": [50.0, 50.0], "facingDeg": 170.0}
    assert cs.unlit_entrance_errors([door], [shell, window], rows.get) == []


def test_the_effect_contract_reads_no_manifest_per_effect(monkeypatch):
    """r5 review (CONFIRMED): `effect_contract` re-read the kit manifest for
    every effect placement; the export reads each manifest once
    (`_kit_assets`) and hands the effect rows in."""
    brazier = _claywater_brazier()
    fx = cs.socket_effect_placements("bp", "seed", [brazier], _Shelf(),
                                     {"fire": {BRAZIER: {"offsetM": [0.0, 1.0, 0.0], "n": 3}}},
                                     [])[0]
    fx["provenance"] = {"sourceBlueprintId": "bp"}
    monkeypatch.setattr(ex, "_read", lambda path: (_ for _ in ()).throw(AssertionError(path)))
    out = ex.effect_contract("bp", fx, effect_rows={"works-v1": {"fx:smoke-column": {}}})
    assert out["kind"] == "effect"


def test_kit_assets_hands_back_each_kits_effect_rows(tmp_path, monkeypatch):
    (tmp_path / "k.kit.json").write_text(json.dumps(
        {"assets": [], "effectTextures": {"fx:smoke-column": {"uri": "t.ktx2"}}}))
    monkeypatch.setattr(ex, "kit_sidecar_errors", lambda name, d: [])
    monkeypatch.setattr(ex, "glb_structure_errors", lambda path: [])
    (tmp_path / "k.glb").write_bytes(b"")
    effect_rows: dict = {}
    ex._kit_assets({"k"}, tmp_path, set(), effect_rows=effect_rows)
    assert effect_rows == {"k": {"fx:smoke-column": {"uri": "t.ktx2"}}}
