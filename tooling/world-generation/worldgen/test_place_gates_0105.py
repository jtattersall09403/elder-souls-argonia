"""place_gates, decision 0105: R3 fixture density (the runtime's cap and band),
R4 interior-cell variety (region repeat, exhausted linked set, province cap),
R1/R9 setting class (two axes; NOT_MEASURED until the manifests carry it),
R10 reserved doors. Each gate is made to fail on purpose here."""
from __future__ import annotations

import json

from . import place_gates as pg


def _lamp(i, x, z=0.0, layer="light", kind="assembly"):
    return {"id": f"p.lamp{i}", "objectKind": kind, "layer": layer, "kit": "k",
            "assetId": "lamp", "positionM": [x, 0.0, z]}


def test_the_cap_and_band_are_read_from_the_runtime():
    assert pg.lighting_constants() == (16, 200.0)


def test_lights_density_fails_past_the_cap_and_ignores_fixtures_beyond_the_band():
    g = pg.Gates()
    placements = [_lamp(i, float(i)) for i in range(17)]
    pg.lights_gate(g, {"placements": placements}, rows={}, constants=(16, 200.0))
    row = g.rows[-1]
    assert not row["ok"] and "sees 17 light fixtures within 200 m > the cap 16" in row["failures"][0]
    g = pg.Gates()
    # 16 near + 5 far: the far five sit 500 m off, and the sample points near
    # them see only those five
    placements = [_lamp(i, float(i)) for i in range(16)] + [_lamp(100 + i, 500.0 + i) for i in range(5)]
    pg.lights_gate(g, {"placements": placements}, rows={}, constants=(16, 200.0))
    assert g.rows[-1]["ok"] and g.rows[-1]["measured"]["maxSeen"] == 16


def test_fixtures_are_what_the_runtime_lights():
    rows = {("k", "house"): {"category": "architecture", "glowFacingsDeg": [0, 90]},
            ("k", "brazier"): {"light": {"formId": "x"}}}
    placements = [
        {"id": "a", "objectKind": "parcel", "kit": "k", "assetId": "house", "positionM": [0, 0, 0]},
        {"id": "b", "objectKind": "assembly", "layer": "clutter", "kit": "k", "assetId": "brazier",
         "positionM": [1, 0, 0]},
        {"id": "c", "objectKind": "effect", "layer": "light", "assetId": "fx:smoke", "positionM": [2, 0, 0],
         "provenance": {"ruleId": "effect-socket/fire"}},
        {"id": "d", "objectKind": "effect", "layer": "light", "assetId": "fx:smoke", "positionM": [2, 0, 0],
         "provenance": {"ruleId": "effect-socket/smoke"}},
        _lamp(1, 3.0)]
    kinds = sorted(f["kind"] for f in pg.light_fixtures(placements, rows))
    # the house's two glow facings are emissive only (R11): no fixture
    assert kinds == ["fire", "fixture", "fixture"]


BP = {"parcels": [{"id": "parcel.hut", "assetRef": "shell"}, {"id": "parcel.store", "assetRef": "shell"}],
      "doors": [{"id": "door.1", "parcelId": "parcel.hut", "interiorClaim": {"tier": "A", "cellId": "Crafter"}},
                {"id": "door.2", "parcelId": "parcel.store",
                 "interiorClaim": {"tier": "A", "cellId": "Crafter", "why": "fits"}}]}


def _links(cells):
    """``fitting_of``: the cells the fit rule accepts for the parcel."""
    return lambda parcel, culture=None: list(cells)


def test_a_cell_twice_in_one_place_fails_while_the_linked_set_has_unused_cells():
    f, w = pg.interior_variety_failures("place.r.a", BP, [], _links(["Crafter", "Fisher", "Minder"]))
    assert len(f) == 1 and "door.2 uses interior cell Crafter" in f[0] and "['Fisher', 'Minder']" in f[0]


def test_exhausted_is_computed_from_the_fit_set_never_read_from_the_why():
    """0105 R37 (method review r5 table 3): the escape was a string match on
    "exhausted" in the claim's why. A why that says so while the fit set has
    an unused cell fails; a fit set wholly used is excused with no word."""
    bp = json.loads(json.dumps(BP))
    bp["doors"][1]["interiorClaim"]["why"] = "the shell's linked set is exhausted in the region"
    f, w = pg.interior_variety_failures("place.r.a", bp, [], _links(["Crafter", "Fisher"]))
    assert len(f) == 1 and "['Fisher']" in f[0] and w == []
    f, w = pg.interior_variety_failures("place.r.a", BP, [], _links(["Crafter"]))
    assert f == [] and "excused" in w[0] and "R37" in w[0]
    # no cell fits at all: never excused
    f, _ = pg.interior_variety_failures("place.r.a", BP, [], _links([]))
    assert f and "no cell fits" in f[0]


def test_the_fit_set_comes_from_the_fit_rule(monkeypatch):
    """``fitting_cells`` returns the candidates ``claim_for_parcel`` passes."""
    from . import blueprint_interiors as bi
    monkeypatch.setattr(pg, "_FIT_ENV", {"lib": {}, "links": {}, "profile": None, "sourcing": None})
    monkeypatch.setattr(bi, "claim_for_parcel", lambda *a, **k: {"candidates": [
        {"cellId": "B", "fails": []}, {"cellId": "A", "fails": []}, {"cellId": "C", "fails": ["x"]}]})
    assert pg.fitting_cells({"id": "parcel.hut"}) == ["A", "B"]


def test_lights_density_counts_the_neighbours_fixtures_within_the_band(tmp_path):
    """0105 R38: the gate counted only this place's fixtures; a neighbour's
    lamps within 200 m reach the same player. 10 here + 7 in a published
    neighbour 150 m off break the cap of 16; a neighbour 900 m off, and the
    place's own bundle, never count."""
    here = [_lamp(i, float(i)) for i in range(10)]
    near = [{"id": f"n{i}", "kind": "settlement", "kit": "k", "assetId": "lamp",
             "positionM": [150.0 + i, 0.0, 0.0], "provenance": {"ruleId": "parcel-assembly/light"}}
            for i in range(7)]
    far = [{**p, "id": "f" + p["id"], "positionM": [900.0, 0.0, 0.0]} for p in near]
    root = tmp_path / "settlements"
    root.mkdir()
    for name, pl in (("place.r.near", near), ("place.r.far", far), ("place.r.a", here)):
        (root / f"{name}.json").write_text(json.dumps({"placements": pl}))
    (root / "index.json").write_text(json.dumps({"places": [
        {"id": "place.r.near", "bundle": "settlements/place.r.near.json", "positionM": [153.0, 0.0], "radiusM": 5},
        {"id": "place.r.far", "bundle": "settlements/place.r.far.json", "positionM": [900.0, 0.0], "radiusM": 5},
        {"id": "place.r.a", "bundle": "settlements/place.r.a.json", "positionM": [5.0, 0.0], "radiusM": 5}],
        "routes": []}))
    got = pg.neighbour_fixtures("place.r.a", here, 200.0, root)
    assert len(got) == 7 and {f["place"] for f in got} == {"place.r.near"}
    g = pg.Gates()
    pg.lights_gate(g, {"placements": here}, rows={}, constants=(16, 200.0), neighbours=got)
    row = g.rows[-1]
    assert not row["ok"] and "sees 17 light fixtures" in row["failures"][0]
    assert row["measured"]["neighbours"] == {"place.r.near": 7}
    g = pg.Gates()
    pg.lights_gate(g, {"placements": here}, rows={}, constants=(16, 200.0), neighbours=[])
    assert g.rows[-1]["ok"]


def test_sink_fallback_lists_placed_structure_and_tall_pieces():
    """0105 R36 (method review r5 finding H): the owner found the Hist tree
    hanging on the mesh-sill fallback; no gate listed it."""
    rows = {("k", "tree"): {"category": "misc", "sizeM": [20.0, 20.0, 30.0]},
            ("k", "dock"): {"category": "architecture", "sizeM": [4.0, 2.0, 1.0]},
            ("k", "cup"): {"category": "clutter", "sizeM": [0.1, 0.1, 0.1]},
            ("k", "raft"): {"category": "misc", "sizeM": [4.0, 4.0, 1.0], "settingClass": {"vehicle": True}}}

    def pl(i, asset, ev):
        return {"id": f"p.{i}", "kit": "k", "assetId": asset, "scale": 1.0,
                "anchor": {"designedSinkM": {"evidence": ev}}}
    placements = [pl(1, "tree", "mesh-sill"), pl(2, "dock", "mesh-sill (plugin-spread)"),
                  pl(3, "cup", "mesh-sill"), pl(4, "dock", "plugin"), pl(5, "raft", "mesh-sill")]
    f = pg.sink_fallback_failures(placements, rows)
    assert [x.split(" ", 3)[2] for x in f] == ["p.1", "p.2"]
    g = pg.Gates()
    pg.sink_fallback_gate(g, {"placements": placements}, rows)
    assert not g.rows[-1]["ok"] and g.rows[-1]["id"] == "sink.fallback"
    g = pg.Gates()
    pg.sink_fallback_gate(g, {"placements": placements[2:]}, rows)
    assert g.rows[-1]["ok"]


def test_region_repeat_counts_other_places_only_in_the_same_region():
    one = {**BP, "doors": BP["doors"][:1]}
    same = [{"placeId": "place.r.b", "doorId": "d", "cellId": "Crafter"}]
    other = [{"placeId": "place.q.b", "doorId": "d", "cellId": "Crafter"}]
    assert pg.interior_variety_failures("place.r.a", one, same, _links(["Crafter", "Fisher"]))[0]
    assert pg.interior_variety_failures("place.r.a", one, other, _links(["Crafter", "Fisher"])) == ([], [])


def test_province_cap_counts_every_copy():
    one = {**BP, "doors": BP["doors"][:1]}
    claims = [{"placeId": f"place.q{i}.b", "doorId": "d", "cellId": "Crafter"} for i in range(3)]
    f, _ = pg.interior_variety_failures("place.r.a", one, claims, _links(["Crafter"]))
    assert f == ["0105 R4: interior cell Crafter would be used 4 times in the province (cap 3)"]
    # this place's own claim rows never double-count its blueprint
    mine = [{"placeId": "place.r.a", "doorId": "door.1", "cellId": "Crafter"}]
    assert pg.interior_variety_failures("place.r.a", one, claims[:2] + mine, _links(["Crafter"])) == ([], [])


def test_claim_cells_replaces_the_place_rows_and_keeps_signatures(tmp_path):
    path = tmp_path / "claims.json"
    path.write_text(json.dumps({"schemaVersion": 1, "claims": [{"signature": "s", "placeId": "x",
                                                                "claimedAt": "t"}]}))
    pg.claim_interior_cells("place.r.a", BP, "2026-09-28T00:00:00Z", path)
    one = {**BP, "doors": BP["doors"][:1]}
    pg.claim_interior_cells("place.r.a", one, "2026-09-29T00:00:00Z", path)
    doc = json.loads(path.read_text())
    assert doc["claims"][0]["signature"] == "s"
    assert doc["interiorCellClaims"] == [{"placeId": "place.r.a", "doorId": "door.1", "cellId": "Crafter",
                                          "claimedAt": "2026-09-28T00:00:00Z"}]


def _sc(n, **settings):
    """A mine_setting_class row: settings = {setting: [licensed classes]}."""
    return {"settingClass": {"n": n, "interior": {}, "exterior": {}, "settings": settings,
                             "sourceCells": ["SomeCell"], "evidence": "plugin" if n else "unplaced"}}


def test_setting_class_fails_an_interior_piece_outside_and_a_keep_piece_in_a_village():
    placements = [{"id": x, "objectKind": "assembly", "kit": "k", "assetId": x, "positionM": [0, 0, 0]}
                  for x in ("sconce", "keepstable", "barrel", "modpiece", "neverplaced", "unmined")]
    rows = {("k", "sconce"): _sc(40, interior=["town", "village"]),
            ("k", "keepstable"): _sc(3, exterior=["keep"]),
            ("k", "barrel"): _sc(39, interior=["town"], exterior=["town", "village"]),
            ("k", "modpiece"): _sc(12, exterior=["wild"]),       # a licence, no class: passes
            ("k", "neverplaced"): _sc(0)}
    f, w, un = pg.setting_failures(placements, rows, "village")
    assert len(f) == 3, f
    assert "sconce is placed exterior here; its plugin licenses it interior" in f[0]
    assert "keepstable stands in a village" in f[1] and "['keep']" in f[1]
    assert "neverplaced" in f[2] and "unplaced" in f[2]
    assert un == ["unmined"]
    g = pg.Gates()
    pg.setting_gate(g, {"placements": placements[5:]}, None, rows={})
    assert g.rows[-1]["ok"] and "NOT_MEASURED" in g.rows[-1]["warnings"][0]


def test_place_setting_class_is_the_recipe_row_field():
    assert pg.place_setting_class({"type": "hist-village", "settingClass": "village"}) == "village"
    assert pg.place_setting_class({"type": "watchtower", "settingClass": "keep"}) == "keep"
    assert pg.place_setting_class({"type": "x"}) is None                 # no field: not judged
    assert pg.place_setting_class({"type": "x", "settingClass": "hamlet"}) is None


def test_every_type_recipe_row_carries_a_setting_class():
    path = pg.REPO_ROOT / "world" / "sources" / "catalogue" / "type-recipes.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert doc["vocabularies"]["settingClass"] == list(pg.PLACE_CLASSES)
    bad = [r["type"] for r in doc["types"] if r.get("settingClass") not in pg.PLACE_CLASSES]
    assert bad == []
    # 0105 R16/R17: every row is its kind's derivation, never a hand value
    drift = [r["type"] for r in doc["types"]
             if r["settingClass"] != pg.derive_setting_class(r) or r.get("builtBy") != pg.derive_built_by(r)]
    assert drift == []
    by = {r["type"]: r["settingClass"] for r in doc["types"]}
    # the two built places (16k types 1 and 2) are villages
    assert by["road-station-village"] == by["hist-village"] == "village"
    assert by["wamasu-pond"] == by["vista-ledge"] == by["wild-hist"] == "wild"
    assert by["patrol-shelter"] == by["beacon-platform"] == by["holding-pit"] == "camp"
    assert by["occupied-fort"] == "keep"
    # 0105 R21: prisons and watchtowers are the keep's arm; R22: a ducal ruin
    # takes the keep pool inside the ruin
    assert by["prison-ruin"] == by["reoccupied-prison"] == by["watchtower"] == "keep"
    built = {r["type"]: r.get("builtBy") for r in doc["types"]}
    assert built["ducal-ruin"] == "keep" and built["drowned-village"] == "village"


def _piece(x, **kw):
    return {"id": x, "objectKind": "assembly", "kit": "k", "assetId": x, "positionM": [0, 0, 0], **kw}


def test_r9_small_dressing_is_exempt_from_the_setting_axis_but_lights_and_big_pieces_are_not():
    placements = [_piece("cup"), _piece("bigcup", scale=2.5), _piece("sconce", layer="light"),
                  _piece("glowjar"), _piece("chair")]
    rows = {("k", "cup"): {**_sc(20, interior=["town"]), "sizeM": [0.2, 0.3, 0.2]},
            ("k", "bigcup"): {**_sc(20, interior=["town"]), "sizeM": [0.2, 0.5, 0.2]},
            ("k", "sconce"): {**_sc(40, interior=["town"]), "sizeM": [0.3, 0.4, 0.2]},
            ("k", "glowjar"): {**_sc(9, interior=["town"]), "sizeM": [0.2, 0.2, 0.2],
                               "glowMaterials": ["m"]},
            ("k", "chair"): {**_sc(30, interior=["town"]), "sizeM": [0.6, 1.1, 0.6]},
            ("k", "table"): {**_sc(30, interior=["town"]), "sizeM": [3.02, 1.47, 0.91]}}
    placements.append(_piece("table"))
    f, _, _ = pg.setting_failures(placements, rows, "village")
    named = [x.split(":")[1].split()[0] for x in f]
    # R14: the largest dimension under 1.2 m is small dressing (cup, chair);
    # a 3 m table with one dimension under it is not
    assert named == ["bigcup", "sconce", "glowjar", "table"], f


def test_r15_a_vehicle_is_exempt_from_axis_i():
    rows = {("k", "canoe"): {**_sc(0), "sizeM": [2, 6.8, 2.1]},
            ("k", "raft"): {**_sc(0), "sizeM": [3.2, 4.1, 1.7]}}
    rows[("k", "canoe")]["settingClass"]["vehicle"] = True
    f, _, _ = pg.setting_failures([_piece("canoe"), _piece("raft")], rows, "village")
    assert len(f) == 1 and "raft" in f[0], f


def test_r9_social_scale_pools():
    rows = {("k", "townonly"): _sc(10, exterior=["town"]),
            ("k", "keeponly"): _sc(10, exterior=["keep"]),
            ("k", "villageonly"): _sc(10, exterior=["village"]),
            ("k", "ruinonly"): _sc(10, exterior=["ruin"]),
            ("k", "wildonly"): _sc(10, exterior=["wild"])}
    names = list(k for _, k in rows)

    def red(place_class):
        f, _, _ = pg.setting_failures([_piece(x) for x in names], rows, place_class)
        return sorted(x.split(":")[1].split()[0] for x in f)
    assert red("village") == ["keeponly", "ruinonly"]              # town/village/camp: one pool
    assert red("camp") == ["keeponly", "ruinonly"]
    assert red("keep") == ["ruinonly", "townonly", "villageonly"]   # keep is exclusive
    assert red("ruin") == ["keeponly", "townonly", "villageonly"]
    assert red(None) == []                                          # no class: axis ii not judged
    assert red("wild") == ["keeponly"]                              # R17: every pool but keep's

    def red_recipe(recipe):
        f, _, _ = pg.setting_failures([_piece(x) for x in names], rows, recipe["settingClass"],
                                      pool=pg.place_pool(recipe))
        return sorted(x.split(":")[1].split()[0] for x in f)
    # R16: a village ruin takes village + ruin; keep stays exclusive
    assert red_recipe({"settingClass": "ruin", "builtBy": "village"}) == ["keeponly"]
    # R22: a keep-built ruin opens the keep pool, inside the ruin place only
    assert red_recipe({"settingClass": "ruin", "builtBy": "keep"}) == ["townonly", "villageonly"]
    assert red_recipe({"settingClass": "village", "builtBy": "keep"}) == ["keeponly", "ruinonly"]


def test_r23_a_class_on_one_reference_is_not_measured_on_axis_ii():
    """genericwell01: keep-only on n 1. The miner licenses its setting and no
    class (CLASS_MIN_REFS), so a village passes it with a NOT_MEASURED line."""
    well = _sc(1, exterior=[])
    well["settingClass"].update(exterior={"keep": 1}, classNotMeasured={"exterior": {"keep": 1}})
    stable = _sc(3, exterior=["keep"])
    stable["settingClass"]["exterior"] = {"keep": 3}
    # a class the ordinary floor left out (village 2 of n 30) is no R23 case
    wildish = _sc(30, exterior=["wild"])
    wildish["settingClass"]["exterior"] = {"wild": 28, "village": 2}
    rows = {("k", "well"): well, ("k", "stable"): stable, ("k", "mod"): _sc(1, exterior=["wild"]),
            ("k", "wildish"): wildish}
    f, w, _ = pg.setting_failures([_piece(x) for x in ("well", "stable", "mod", "wildish")],
                                  rows, "village")
    assert len(f) == 1 and "stable" in f[0], f
    assert len(w) == 1 and "NOT_MEASURED: 1 piece" in w[0] and "well (keep 1)" in w[0], w
    _, w, _ = pg.setting_failures([_piece("well")], rows, None)       # axis ii not judged: no line
    assert w == []


def test_setting_gate_warns_when_the_place_has_no_setting_class():
    g = pg.Gates()
    pg.setting_gate(g, {"placements": [_piece("keeponly")]}, None,
                    rows={("k", "keeponly"): _sc(10, exterior=["keep"])})
    assert g.rows[-1]["ok"] and any("no settingClass" in w for w in g.rows[-1]["warnings"])


def _bp(tier, use, services=None):
    return {"parcels": [{"id": "p1", "use": use, **({"services": services} if services else {})}],
            "doors": [{"id": "d1", "parcelId": "p1", "interiorClaim": {"tier": tier, "why": "no link"}}]}


def test_r10_a_reserved_door_fails_on_a_dwelling_workplace_shop_or_store():
    for use in ("dwelling", "lodging", "work", "shop", "kiln", "storage"):
        f = pg.reserved_failures(_bp("reserved", use))
        assert len(f) == 1 and "0105 R10" in f[0] and "d1" in f[0], use
    assert pg.reserved_failures(_bp("reserved", "civic", ["trader"]))            # a shop by service
    assert pg.reserved_failures(_bp("reserved", "hall")) == []                  # tier B/C: legal
    assert pg.reserved_failures(_bp("reserved", "entrance")) == []
    assert pg.reserved_failures(_bp("A", "dwelling")) == []
    g = pg.Gates()
    pg.reserved_gate(g, _bp("reserved", "dwelling"))
    assert g.rows[-1]["id"] == "interiors.reserved" and not g.rows[-1]["ok"]


FAKE_WB = '''
import hashlib, json, os, sys
from pathlib import Path
layout = Path(sys.argv[2])
pid = json.loads(layout.read_text())["placeId"]
out = Path(os.environ["WB_OUTPUT"]) / "apply"
if os.environ.get("FAKE_WB_FAIL"):
    sys.exit("apply failed")
out.mkdir(parents=True, exist_ok=True)
(out / f"{pid}.json").write_text(json.dumps({"layoutSha256": hashlib.sha256(layout.read_bytes()).hexdigest()}))
bp = {"doors": [{"id": "door.1", "parcelId": "parcel.hut", "interiorClaim": {"cellId": "FreshCell"}}]}
(out / f"{pid}.blueprint.json").write_text(json.dumps({"blueprint": bp}))
'''


def _claim_world(tmp_path, monkeypatch):
    """A place whose committed blueprint still holds the old cell; a fake
    ``wb.py apply`` derives the re-shelled door's new cell from the layout."""
    pid = "place.r.hut"
    blueprints = tmp_path / "blueprints"
    blueprints.mkdir()
    (blueprints / "hut.layout.json").write_text(json.dumps({"placeId": pid}))
    stale = {"doors": [{"id": "door.1", "parcelId": "parcel.hut",
                        "interiorClaim": {"cellId": "KeebaHouseCrafter"}}]}
    (blueprints / f"{pid}.json").write_text(json.dumps({"blueprint": stale}))
    wb = tmp_path / "wb" / "wb.py"
    wb.parent.mkdir()
    wb.write_text(FAKE_WB)
    monkeypatch.setattr(pg, "BLUEPRINTS", blueprints)
    monkeypatch.setattr(pg, "WB", wb)
    monkeypatch.setattr(pg, "WB_SHARED", tmp_path / "out")
    claims = tmp_path / "claims.json"
    claims.write_text(json.dumps({"schemaVersion": 1, "claims": []}))
    return pid, claims


def test_claim_cells_reads_the_layout_derived_blueprint_never_the_committed_one(tmp_path, monkeypatch):
    pid, claims = _claim_world(tmp_path, monkeypatch)
    rows = pg.claim_cells(pid, "2026-09-28T00:00:00Z", path=claims)
    assert [r["cellId"] for r in rows] == ["FreshCell"]
    assert [c["cellId"] for c in json.loads(claims.read_text())["interiorCellClaims"]] == ["FreshCell"]
    # the gate grades the same file the claims read
    assert pg.layout_blueprint(pid, True) == pg.derived_blueprint_path(pid)


def test_claim_cells_claims_nothing_when_the_apply_derives_no_blueprint(tmp_path, monkeypatch):
    pid, claims = _claim_world(tmp_path, monkeypatch)
    pg.claim_cells(pid, "2026-09-28T00:00:00Z", path=claims)
    before = claims.read_text()
    # the last run's derived blueprint is still on disk; a failed apply must not reuse it
    monkeypatch.setenv("FAKE_WB_FAIL", "1")
    import pytest
    with pytest.raises(RuntimeError, match="no cells claimed"):
        pg.claim_cells(pid, "2026-09-29T00:00:00Z", path=claims)
    assert not pg.derived_blueprint_path(pid).exists()
    assert claims.read_text() == before


def test_spatial_grid_matches_the_all_pairs_results_on_claywater_and_greenspring():
    """The fixture-density and per-dwelling counts bucketed in a uniform grid
    equal the all-pairs values the gates reported on 2026-09-28 (the inputs
    and results frozen in testdata before the grid)."""
    from pathlib import Path
    doc = json.loads((Path(__file__).parent / "testdata" / "place-gates-grid-equality.json").read_text())
    assert sorted(doc["places"]) == ["place.hist-heartland.greenspring", "place.imperial-fringe.claywater-station"]
    for pid, case in doc["places"].items():
        want = case["expected"]
        assert pg.fixture_density(case["placements"], case["fixtures"], case["bandM"]) == want["fixtureDensity"], pid
        fps = {k: [tuple(xy) for xy in v] for k, v in case["footprints"].items()}
        got = pg.breadth_measure(case["placements"], set(case["dwellings"]), fps)["dressingPerDwelling"]
        assert got == want["dressingPerDwelling"], pid


def test_spatial_grid_matches_all_pairs_across_cell_edges():
    """Fixtures and placements on and around the grid lines, the band edge and
    negative coordinates count exactly as the all-pairs loop counts them."""
    import random
    rnd = random.Random(3)
    band = 50.0
    fixtures = [{"id": f"f{i}", "kind": "fixture",
                 "at": (rnd.choice([-100.0, -50.0, 0.0, 50.0, 100.0]) + rnd.choice([0.0, 1e-9, -1e-9, 25.0]),
                        rnd.uniform(-150, 150))} for i in range(60)]
    placements = [{"id": f"p{i}", "objectKind": "assembly", "layer": "clutter", "assetId": "a",
                   "positionM": [rnd.uniform(-150, 150), 0.0, rnd.uniform(-150, 150)]} for i in range(80)]
    got = pg.fixture_density(placements, fixtures, band)
    samples = [(p["positionM"][0], p["positionM"][2]) for p in placements]
    xs, zs = [x for x, _ in samples], [z for _, z in samples]
    g = pg.LIGHT_GRID_M
    samples += [(min(xs) + i * g, min(zs) + j * g) for i in range(int((max(xs) - min(xs)) // g) + 2)
                for j in range(int((max(zs) - min(zs)) // g) + 2)]
    brute = max(sum(1 for f in fixtures if (f["at"][0] - x) ** 2 + (f["at"][1] - z) ** 2 <= band * band)
                for x, z in samples)
    assert got["maxSeen"] == brute
    # a dwelling whose footprint straddles cells, placements exactly at the reach
    reach = pg.DWELLING_REACH_M
    fp = [(-3.0, -3.0), (3.0, -3.0), (3.0, 3.0), (-3.0, 3.0)]
    scene = [{"id": "parcel.a.building", "objectKind": "parcel", "parcelId": "parcel.a", "positionM": [0, 0, 0]}]
    scene += [{"id": f"d{i}", "objectKind": "assembly", "layer": "clutter", "assetId": "a",
               "positionM": [x, 0.0, z]} for i, (x, z) in enumerate(
                   [(3 + reach, 0), (3 + reach + 1e-6, 0), (-3 - reach, 0), (0, -3 - reach), (-40, -40)])]
    assert pg.breadth_measure(scene, {"parcel.a"}, {"parcel.a": fp})["dressingPerDwelling"] == {"parcel.a": 3}
