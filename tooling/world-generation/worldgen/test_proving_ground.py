"""The proving ground (16h part 1): the scratch yard every placement mechanism
is shown on before it is used on a real place.

Checks the authored yard (`world/sources/blueprints/place.fixture.proving-ground.json`),
its site record (`world/sources/sites/proving-ground.json`) and what the studio
publishes of it (`apps/world-studio/public/province/settlements.json`):

* rule 2 (16h round 5): a parcel whose manifest policy is direct/pad sits on
  footprint cells under 2.0°, a stilt fit on cells under 3.0° (it stands on
  legs by design). A cell is a `slope_grid` cell of the survey's analysis grid
  that the derived footprint touches. A piece of a quay kit
  (`SLOPE_EXEMPT_KITS`, the kit read from the published manifest that holds
  it) carries no building slope rule (16h round 6). The rule is the compile's
  own (`compile_settlement.fit_slope_failure`, 97 B3, K5); these tests call it;
* the hull floats: every recorded-depth cell whose centre lies within 2.5 m of
  its footprint carries >= 1 m of water;
* the way reaches the hull over the landing stage, never a ford > 12 m;
* the three part-2 test sites are present and still empty;
* the sconce and the huntsman sign are published as mounted children;
* no published yard piece floats: the runtime's anchor
  (`packages/game-core/src/settlement/anchoring.ts` `anchorPlacement`) is
  recomputed on the compile's sampler (`ProvinceSurvey.height_at`); a piece
  whose fit 97 B3 refuses on its own footprint, or a quay-kit piece, is exempt.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from shapely.geometry import LineString, Point, Polygon

from . import blueprint as bp_mod
from . import compile_settlement as cs
from .blueprint_integration import ROAD_WATER_MAX_M, _water_at

REPO_ROOT = Path(__file__).resolve().parents[3]
BLUEPRINT = REPO_ROOT / "world/sources/blueprints/place.fixture.proving-ground.json"
KITS = REPO_ROOT / "apps/world-studio/public/kits"
PUBLISHED = REPO_ROOT / "apps/world-studio/public/province/settlements.json"
YARD = "place.fixture.proving-ground"

HULL_HALO_M = 2.5
HULL_MIN_DEPTH_M = 1.0
LANDING_REACH_M = 2.5      # the way's end to the landing stage's footprint
BERTH_REACH_M = 1.5        # the landing stage's footprint to the hull's
FLOAT_LIMIT_M = 0.3
SILL_LIMIT_M = 0.15
PART_TWO_KEYS = ("padTestCorner", "clearingTestArea", "rockTestPoint")
SCONCE = "vanilla:clutter/imperial/impwallsconcecandle01"
SIGN = "vanilla:clutter/signage/whiterun/signwrdrunkenhuntsman01"


def _yard() -> dict:
    return json.loads(BLUEPRINT.read_text())["blueprint"]


def _poly_m(footprint: list, extent_m: float) -> Polygon:
    return Polygon([(u * extent_m, v * extent_m) for u, v in footprint])


def _row(asset_ref: str) -> dict:
    """The published manifest row holding this asset, with its `kit`."""
    row = cs.KitShelf(KITS).locate(asset_ref)
    assert row is not None, asset_ref
    return row


def slope_failures(bp: dict, survey, limits: dict[str, float]) -> list[str]:
    """The compile's own 97 B3 rule (`compile_settlement.fit_slope_failure`)
    over every parcel of the yard."""
    shelf = cs.KitShelf(KITS)
    out = []
    for parcel in bp["parcels"]:
        if "pieces" in parcel:
            # 16h K9: a run is judged piece by piece on each laid outline,
            # as the compile does
            laid, _ = cs.fp_mod.lay_pieces(parcel)
            polys = cs.fp_mod.laid_polygons_m(parcel, laid) or []
            checks = [(row["asset"], poly) for row, poly in zip(laid, polys)]
        else:
            checks = [(parcel["assetRef"],
                       [survey.uv_to_m(u, v) for u, v in parcel["footprint"]])]
        for asset, foot_m in checks:
            slope = cs.footprint_max_slope_deg(foot_m, survey)
            why = cs.fit_slope_failure(shelf.locate(asset), slope, limits)
            if why:
                out.append(f"{parcel['id']}: {why}")
    return out


def test_a_fixture_site_record_stands_in_for_the_catalogue_row_and_the_siting(tmp_path, monkeypatch):
    bp = _yard()
    known = bp_mod.catalogue_ids()
    assert YARD not in known

    def rule_errors() -> list[str]:
        errors = bp_mod.validate_blueprint(bp, known, None, [])
        return [e for e in errors if "place catalogue" in e or "97 B1" in e]

    assert rule_errors() == []
    monkeypatch.setattr(bp_mod, "SITES_DIR", tmp_path)
    assert len(rule_errors()) == 2
    (tmp_path / "proving-ground.json").write_text(json.dumps({"id": YARD, "fixture": False}))
    assert len(rule_errors()) == 2, "a site record that is not a fixture stands in for nothing"


def test_every_parcel_sits_within_its_fit_slope_limit(survey):
    assert slope_failures(_yard(), survey, cs.FIT_SLOPE_LIMIT_DEG) == []


def test_a_dock_piece_is_exempt_but_a_direct_building_on_the_same_slope_fails():
    landing = next(p["assetRef"] for p in _yard()["parcels"]
                   if p["id"] == "parcel.proving-ground.landing-stage")
    assert _row(landing)["kit"] in cs.SLOPE_EXEMPT_KITS
    assert cs.fit_slope_failure(_row(landing), 4.36) is None
    for parcel_id, fit in (("parcel.proving-ground.sconce-wall", "direct"),
                           ("parcel.proving-ground.mud-hut", "stilt")):
        row = _row(next(p["assetRef"] for p in _yard()["parcels"] if p["id"] == parcel_id))
        assert cs.asset_fit(row) == fit and row["kit"] not in cs.SLOPE_EXEMPT_KITS
        assert cs.fit_slope_failure(row, 4.36), parcel_id


def test_the_compile_slope_rule_fails_a_direct_fit_on_a_steep_stub_and_spares_a_dock():
    """The gate can fail (97 B3 in the compile): a direct fit on a 2.5° stub
    is refused, a stilt fit is held under 3°, a dock piece on 4.36° passes."""
    direct = {"kit": "settlement-mud-v1", "placement": {"evidence": {"policyId": "direct"}}}
    stilt = {"kit": "settlement-stilt-v1", "placement": {"evidence": {"policyId": "stilt"}}}
    dock = {"kit": "docks-v1", "placement": {"evidence": {"policyId": "stilt"}}}
    assert cs.fit_slope_failure(direct, 2.5)
    assert cs.fit_slope_failure(direct, 1.9) is None
    assert cs.fit_slope_failure(stilt, 2.5) is None
    assert cs.fit_slope_failure(stilt, 3.1)
    assert cs.fit_slope_failure(dock, 4.36) is None


def test_the_slope_check_can_fail(survey):
    impossible = {fit: 0.01 for fit in cs.FIT_SLOPE_LIMIT_DEG}
    assert slope_failures(_yard(), survey, impossible)


COMPOSITES = ("composite:stilt/bamboohut01-with-door", "composite:stilt/stilthouse-with-door",
              "composite:farmhouse/farmhouse01-with-door")
#: The composites whose building has an interior, so a door (a transition,
#: 0081). The stilt house has none in any plugin: its leaf is a static part
#: and its parcel is authored `interior: {kind: "none"}` (owner check-in 2).
DOOR_COMPOSITES = ("composite:stilt/bamboohut01-with-door",
                   "composite:farmhouse/farmhouse01-with-door")
DOOR_DOORWAY_M = 0.5


def _published_yard(bundle: dict, place: str = YARD) -> tuple[list[dict], list[dict]]:
    """The yard's published rows. A published placement carries `kind`
    (`settlement` for a parcel's piece, `dressing`, `landmark`) and no
    `objectKind`/`parcelId`: those are the compile's own fields."""
    placements = [row for row in bundle["placements"] if row["id"].startswith(place + ".")]
    doors = [row for row in bundle["doors"] if row.get("settlementId") == place]
    return placements, doors


def door_doorway_gaps(bundle: dict, interiors: dict[str, dict], place: str = YARD) -> dict[str, float]:
    """Per yard composite: the published door threshold's distance to the
    composite's doorway, put into the world from the COMPILED placement
    (position and yaw) and the kit's entrance meta (`entrance.offsetM`), so
    the check reads what the runtime is handed, never the blueprint (K6: the
    K5 test re-derived both points from the blueprint and agreed with itself)."""
    from .blueprint_integration import runtime_world_xz
    placements, doors = _published_yard(bundle, place)
    by_parcel = {row["id"][len(place) + 1:-len(".building")]: row for row in placements
                 if row.get("kind") == "settlement" and row["id"].endswith(".building")}
    gaps = {}
    for door in doors:
        placement = by_parcel.get(door["parcelId"])
        if placement is None or placement["assetId"] not in DOOR_COMPOSITES:
            continue
        way = (interiors.get(placement["assetId"]) or {}).get("entrance") or {}
        offset = way.get("offsetM")
        if offset is None:        # a radial entrance: its measured assembly row
            rows = [row for row in cs.piece_doorways(placement["assetId"], interiors)
                    if row.get("sideDeg") is not None]
            offset = rows[0]["offsetInPieceM"] if rows else None
        assert offset is not None, placement["assetId"]
        x, _y, z = placement["positionM"]
        wx, wz = runtime_world_xz((x, z), float(placement["yawDeg"]), offset[:2])
        gaps[placement["assetId"]] = round(Point(door["thresholdM"]).distance(Point(wx, wz)), 3)
    return gaps


@pytest.mark.parametrize("place", ("place.fixture.proving-ground", "place.fixture.proving-ground-b"))
def test_every_yard_composite_door_stands_on_its_doorway(place):
    """K6 (brief § Part 1 state, cause 3): for every composite in the yard the
    published door threshold equals the doorway within 0.5 m."""
    bundle = json.loads(PUBLISHED.read_text())
    gaps = door_doorway_gaps(bundle, cs.kit_interiors(), place)
    assert set(gaps) == set(DOOR_COMPOSITES), gaps
    assert all(gap <= DOOR_DOORWAY_M for gap in gaps.values()), gaps


def test_the_door_check_fails_on_a_door_moved_off_its_doorway():
    bundle = json.loads(PUBLISHED.read_text())
    moved = json.loads(json.dumps(bundle))
    for door in moved["doors"]:
        if door.get("settlementId") == YARD:
            door["thresholdM"] = [door["thresholdM"][0] + 3.0, door["thresholdM"][1]]
    gaps = door_doorway_gaps(moved, cs.kit_interiors())
    assert gaps and all(gap > DOOR_DOORWAY_M for gap in gaps.values()), gaps


def _composite_parts() -> dict[str, list[dict]]:
    """Every yard composite's `compose.parts`, from the kit configs."""
    out = {}
    for path in sorted(cs.KIT_CONFIG_DIR.glob("*.json")):
        for row in json.loads(path.read_text()).get("assets", []):
            if row.get("asset") in COMPOSITES:
                out[row["asset"]] = row["compose"]["parts"]
    return out


def door_piece_gaps(parts_of: dict[str, list[dict]], interiors: dict[str, dict]) -> dict[str, float]:
    """Per composite whose door leaf is an offset part: the plan distance from
    the leaf's pivot to the nearest doorway the compile binds doors to
    (`compile_settlement.piece_doorways`), both in the piece plane (x east,
    z south; a z-up part offset (x, y) is (x, -y) there). K7: the mud hut's
    leaf stood 1.6 m outside its doorway because the assembly offset was taken
    at the plugin's 1.30 hut scale."""
    from .mine_assemblies import is_door_piece
    gaps = {}
    for asset_id, parts in parts_of.items():
        ways = [row["offsetInPieceM"] for row in cs.piece_doorways(asset_id, interiors)
                if row.get("offsetInPieceM")]
        leaves = [p for p in parts[1:] if p.get("offsetM") and is_door_piece(p["asset"])
                  and "frame" not in p["asset"].rsplit("/", 1)[-1]]
        if not ways or not leaves:
            continue
        gaps[asset_id] = round(min(math.hypot(p["offsetM"][0] - w[0], -p["offsetM"][1] - w[1])
                                   for p in leaves for w in ways), 3)
    return gaps


def test_every_yard_composite_door_leaf_stands_in_its_doorway():
    """K7 (planner ruling D): the door rule for every yard composite, on the
    kit itself, the stilt house's leaf included (seated in its doorway since
    check-in 2; before, at the shared origin, it stood in the roof)."""
    gaps = door_piece_gaps(_composite_parts(), cs.kit_interiors())
    assert set(gaps) >= {"composite:stilt/stilthouse-with-door",
                         "composite:farmhouse/farmhouse01-with-door"}, gaps
    assert all(gap <= DOOR_DOORWAY_M for gap in gaps.values()), gaps


def test_the_door_leaf_check_fails_on_the_shared_origin():
    """The gate can fail: the stilt house's leaf back at the shared origin
    (the K14 composite, whose leaf stood 1.29 m above the deck with its head
    in the roof) stands about 3 m inside the front doorway, over the limit."""
    parts = _composite_parts()
    house = "composite:stilt/stilthouse-with-door"
    parts[house] = [dict(p, offsetM=[0.0, 0.0, 0.0]) if "dooranim" in p["asset"] else p
                    for p in parts[house]]
    assert door_piece_gaps(parts, cs.kit_interiors())[house] > DOOR_DOORWAY_M


def test_a_fixture_carries_no_ring_dressing(survey):
    """K7 (planner ruling C, 97 decision 4): the yard's parcels would take
    ring dressing by their use, but a fixture carries none; its only
    dressing is the two mount exemplars its blueprint places."""
    bp = _yard()
    assert any(cs.dressing_count(str(bp["seed"]), p) for p in bp["parcels"])
    doc = cs.compile_blueprint(bp, survey, cs.KitShelf(KITS))
    assert doc["dressingReport"]["objects"] == 0
    assert not [p["id"] for p in doc["placements"] if p.get("objectKind") == "dressing"]
    landmarks = {p["assetId"] for p in doc["placements"] if p.get("objectKind") == "landmark"}
    assert {SCONCE, SIGN} <= landmarks | {p["assetId"] for p in doc["placements"]}


def test_the_landing_stage_starts_at_the_shore_and_ends_at_the_hull(survey):
    """K6: the quay run's landward tip stands within 0.5 m of the ground/water
    line (the survey's wet edge) and its seaward tip within 0.5 m of the
    hull's outline."""
    from .blueprint_integration import runtime_world_xz
    placements, _doors = _published_yard(json.loads(PUBLISHED.read_text()))
    stage = next(row for row in placements if row["id"].endswith("landing-stage.building"))
    hull = next(row for row in placements if row["id"].endswith("hull-berth.building"))
    kits = _published_kits(json.loads(PUBLISHED.read_text()))
    asset = kits[stage["kit"]][stage["assetId"]]
    landward, seaward = cs.quay_run_ends_local(asset)
    centre = (stage["positionM"][0], stage["positionM"][2])

    def wet(t: float) -> bool:
        row, col = survey.grid_px(*runtime_world_xz(centre, stage["yawDeg"], (0.0, t)))
        return bool(survey.wet_grid[row, col])

    assert not wet(landward - DOOR_DOORWAY_M) and wet(landward + DOOR_DOORWAY_M)
    h = kits[hull["kit"]][hull["assetId"]]
    size, off = h["sizeM"], h["originOffsetM"]
    corners = [(-off[0], -(size[1] - off[1])), (size[0] - off[0], -(size[1] - off[1])),
               (size[0] - off[0], off[1]), (-off[0], off[1])]
    outline = Polygon([runtime_world_xz((hull["positionM"][0], hull["positionM"][2]),
                                        hull["yawDeg"], c) for c in corners])
    tip = Point(runtime_world_xz(centre, stage["yawDeg"], (0.0, seaward)))
    assert outline.exterior.distance(tip) <= DOOR_DOORWAY_M or outline.contains(tip)


def test_no_yard_dressing_stands_over_water(survey):
    """K6 cause 4: a ring dressing prop with no dry ground under it has no
    host and is dropped (the chairs round the hull and the landing stage)."""
    placements, _doors = _published_yard(json.loads(PUBLISHED.read_text()))
    dressing = [row for row in placements if row.get("kind") == "dressing"]
    assert dressing or not any(".dressing." in row["id"] for row in placements)
    wet = [row["id"] for row in dressing
           if survey.wet_grid[survey.grid_px(row["positionM"][0], row["positionM"][2])]]
    assert not wet, wet


def test_the_hull_floats_on_a_metre_of_water_all_round(survey):
    bp = _yard()
    hull = next(p for p in bp["parcels"] if p["id"] == "parcel.proving-ground.hull-berth")
    halo = _poly_m(hull["footprint"], survey.extent_m).buffer(HULL_HALO_M)
    depth = survey.water_signed_depth_m
    pm = survey.extent_m / depth.shape[0]
    x0, z0, x1, z1 = halo.bounds
    cells = [float(depth[r, c])
             for r in range(int(z0 // pm), int(z1 // pm) + 1)
             for c in range(int(x0 // pm), int(x1 // pm) + 1)
             if halo.contains(Point((c + .5) * pm, (r + .5) * pm))]
    assert cells and min(cells) >= HULL_MIN_DEPTH_M, cells


def test_the_way_reaches_the_hull_over_the_landing_stage_never_a_long_ford(survey):
    bp = _yard()
    e = survey.extent_m
    parcels = {p["id"]: p for p in bp["parcels"]}
    way = next(r for r in bp["routes"] if r["id"] == "route.proving-ground.way")
    line = LineString([(u * e, v * e) for u, v in way["points"]])
    n = max(2, int(line.length / 4.0))       # the integration pass's own sampling
    wet = sum(_water_at(survey, *line.interpolate(i / n, normalized=True).coords[0])
              for i in range(n + 1))
    assert wet / (n + 1) * line.length <= ROAD_WATER_MAX_M
    assert "parcel.proving-ground.landing-stage" in way["endsAt"]
    stage = _poly_m(parcels["parcel.proving-ground.landing-stage"]["footprint"], e)
    hull = _poly_m(parcels["parcel.proving-ground.hull-berth"]["footprint"], e)
    assert stage.distance(Point(line.coords[-1])) <= LANDING_REACH_M
    assert stage.distance(hull) <= BERTH_REACH_M


def test_the_part_two_test_sites_are_present_and_empty():
    bp = _yard()
    for key in PART_TWO_KEYS:
        assert key in bp and bp[key] is None, key


@pytest.mark.parametrize("asset_id", [SCONCE, SIGN])
def test_the_mounted_children_are_published_hanging_off_a_parent(asset_id):
    bundle = json.loads(PUBLISHED.read_text())
    rows = [p for p in bundle["placements"]
            if p["id"].startswith(YARD + ".") and p.get("assetId") == asset_id]
    assert rows, f"{asset_id} is not placed in the published yard"
    for row in rows:
        assert row.get("parentPlacementId") and len(row.get("mountOffsetM") or []) == 3, row


def _published_kits(bundle: dict) -> dict[str, dict[str, dict]]:
    """kit id -> asset id -> manifest row (the runtime's `kitAssetMetaOf`)."""
    public = PUBLISHED.parent.parent
    return {kit_id: {a["id"]: a for a in json.loads((public / kit["manifest"]).read_text())["assets"]}
            for kit_id, kit in bundle["kits"].items() if (public / kit["manifest"]).exists()}


def support_at(survey, x: float, z: float) -> float:
    """The surface a stilt's legs stand on: the ground, or the water surface
    where the published signed depth says water covers it."""
    depth = survey.water_signed_depth_m
    pm = survey.extent_m / depth.shape[0]
    row = min(max(int(z // pm), 0), depth.shape[0] - 1)
    col = min(max(int(x // pm), 0), depth.shape[1] - 1)
    return survey.height_at(x, z) + max(0.0, float(depth[row, col]))


def ground_audit(bundle: dict, survey, kits: dict, place: str = YARD) -> list[dict]:
    """anchorPlacement, in Python, over the place's terrain-seated pieces
    (anchor class ground, or a parentless deck; never water).

    The ground line is the mean of the samples, except a `dug-in` fit, which
    anchors on the lowest (97 C11a). float: how far the measured base (pivot
    minus originOffsetM[2]) stands over the lowest sample. sill: how far the
    designed ground line stands from the ground at the pivot; for a stilt fit
    (planner ruling 2026-09-24) how far the designed support line (pivot plus
    sink, the deck less its designed clearance) stands from the support
    surface at the legs, the mean over the samples of the ground or the water
    surface where water covers it, never the terrain at the pivot."""
    site = next(s for s in bundle["settlements"] if s["id"] == place)
    ids = set(site["placementIds"])
    run_y = _run_seats(bundle, survey, place)
    rows = []
    for p in bundle["placements"]:
        asset = kits.get(p["kit"], {}).get(p["assetId"], {})
        klass = p.get("anchorClass") or asset.get("anchorClass") or "ground"
        if p["id"] not in ids or p.get("parentPlacementId") or klass not in ("ground", "deck"):
            continue
        anchor, scale = p["anchor"], float(p.get("scale", 1.0))
        samples = (p["footprintM"] if anchor.get("mode") == "streamed-perimeter"
                   and p.get("footprintM") else [[p["positionM"][0], p["positionM"][2]]])
        heights = [survey.height_at(float(x), float(z)) for x, z in samples]
        fit = cs.asset_fit(asset)
        ground = min(heights) if fit == "dug-in" else sum(heights) / len(heights)
        sink = float(anchor["designedSinkM"]["p50"]) * scale
        y = run_y.get(p["id"], ground - sink)
        pivot_ground = survey.height_at(float(p["positionM"][0]), float(p["positionM"][2]))
        foot = p.get("footprintM") or []
        slope_exempt = bool(asset) and len(foot) >= 3 and cs.fit_slope_failure(
            {**asset, "kit": p["kit"]}, cs.footprint_max_slope_deg(foot, survey)) is not None
        if fit == "stilt":
            support = sum(support_at(survey, float(x), float(z)) for x, z in samples) / len(samples)
            sill = abs(y + sink - support)
        else:
            sill = abs(y + sink - pivot_ground)
        size_z = float((asset.get("sizeM") or [0.0, 0.0, 0.0])[2]) * scale
        top = y - float(anchor["originOffsetM"][2]) * scale + size_z
        rows.append({"id": p["id"], "assetId": p["assetId"], "fit": fit,
                     "topAboveM": top - max(heights),
                     "evidence": anchor["designedSinkM"].get("evidence"), "sink": sink,
                     "slopeExempt": slope_exempt,
                     "dockExempt": p["kit"] in cs.SLOPE_EXEMPT_KITS,
                     "floatM": max(0.0, y - float(anchor["originOffsetM"][2]) * scale - min(heights)),
                     "sillM": sill})
    return rows


@pytest.mark.parametrize("place", ("place.fixture.proving-ground", "place.fixture.proving-ground-b"))
def test_no_published_yard_piece_floats_or_misplaces_its_sill(survey, place):
    bundle = json.loads(PUBLISHED.read_text())
    assert bundle["schemaVersion"] == 3
    rows = ground_audit(bundle, survey, _published_kits(bundle), place)
    assert rows
    slope = [r for r in rows if r["slopeExempt"]]
    docks = [r for r in rows if r["dockExempt"] and not r["slopeExempt"]]
    checked = [r for r in rows if not (r["slopeExempt"] or r["dockExempt"])]
    floats = sorted((r for r in checked if r["floatM"] > FLOAT_LIMIT_M), key=lambda r: -r["floatM"])
    sills = sorted((r for r in rows if r["sillM"] > SILL_LIMIT_M), key=lambda r: -r["sillM"])
    assert not floats, (
        f"{len(floats)}/{len(checked)} float > {FLOAT_LIMIT_M} m (exempt: {len(slope)} whose "
        f"fit 97 B3 refuses on their own footprint, {len(docks)} quay-kit pieces): "
        + "; ".join(f"{r['id']} {r['assetId']} fit={r['fit']} {r['evidence']} "
                    f"sink={r['sink']:.2f} float={r['floatM']:.2f}" for r in floats))
    assert not sills, (f"{len(sills)}/{len(rows)} sills > {SILL_LIMIT_M} m; worst: "
                       + "; ".join(f"{r['id']} {r['sillM']:.2f}" for r in sills[:8]))


VISIBLE_MIN_M = 0.5
"""A terrain-seated yard piece shows at least this much of itself above the
highest ground under its footprint (owner check-in 2, finding 7: the
boardwalk at 4.273/5.739 was seated with 0.35 m of rail above the ground)."""


def buried_pieces(rows: list[dict]) -> list[dict]:
    return sorted((r for r in rows if r["topAboveM"] < VISIBLE_MIN_M), key=lambda r: r["topAboveM"])


@pytest.mark.parametrize("place", ("place.fixture.proving-ground", "place.fixture.proving-ground-b"))
def test_every_published_yard_piece_shows_above_the_ground_at_its_coordinates(survey, place):
    """Headless: the published mesh's top, seated as the runtime seats it
    (`ground_audit`), stands >= VISIBLE_MIN_M over the highest ground sample."""
    bundle = json.loads(PUBLISHED.read_text())
    rows = ground_audit(bundle, survey, _published_kits(bundle), place)
    assert rows
    hidden = buried_pieces(rows)
    assert not hidden, "; ".join(f"{r['id']} top {r['topAboveM']:.2f} m above the ground"
                                 for r in hidden)


def test_the_visibility_probe_fails_on_a_piece_sunk_below_its_top(survey):
    bundle = json.loads(PUBLISHED.read_text())
    kits = _published_kits(bundle)
    victim = next(p for p in bundle["placements"] if p["id"] == f"{YARD}.parcel.proving-ground.boardwalk.building")
    asset = kits[victim["kit"]][victim["assetId"]]
    sunk = dict(victim, anchor={**victim["anchor"], "designedSinkM": {
        **victim["anchor"]["designedSinkM"], "p50": float(asset["sizeM"][2]) + 1.0}})
    bundle = dict(bundle, placements=[sunk if p is victim else p for p in bundle["placements"]])
    assert victim["id"] in {r["id"] for r in buried_pieces(ground_audit(bundle, survey, kits))}


# --- 16h K14: the yard truth table -------------------------------------------
# Hand-written from the mesh geometry before the mined records were read
# (worldgen/fixtures/yard-truth.json). The yard publishes from the current
# record whatever the miner lane's state (owner 2026-09-24); this table is the
# yard's own bar. A mismatch the policy rows cannot fix is listed by key in
# `knownMismatches` with its reason: the test fails when a new one appears
# AND when a listed one stops happening, so the list can never go stale.

TRUTH = Path(__file__).resolve().parent / "fixtures" / "yard-truth.json"
MOUNTS_RECORD = REPO_ROOT / "world/sources/placement/kit-mounts-mined.json"
POLICIES = REPO_ROOT / "tooling/asset-pipeline/pipeline/config/placement-policies.json"


def _row_classes() -> set[str]:
    """Assets whose class an assetPlacement row decides: the manifest realises
    the row ahead of the mined record (planner ruling 2026-09-24), so the
    record's class is not the yard's and only the published one is judged."""
    rows = json.loads(POLICIES.read_text()).get("assetPlacement", {})
    return {asset_id for asset_id, row in rows.items() if "anchorClass" in row}


def _in(value, bounds) -> bool:
    return isinstance(value, (int, float)) and bounds[0] <= value <= bounds[1]


def yard_truth_mismatches(truth: dict, kits_dir: Path, mounts: dict,
                          placements: list[dict], row_classes: frozenset = frozenset()) -> list[str]:
    """``"<assetId> <field>"`` for every published or recorded value the truth
    table does not accept (the rule in this section's header)."""
    found: list[str] = []
    manifests: dict[str, dict] = {}
    anchors = mounts.get("anchors", {})
    for row in truth["assets"]:
        aid = row["assetId"]
        sources = []
        if row["kit"]:
            if row["kit"] not in manifests:
                manifests[row["kit"]] = {a["id"]: a for a in json.loads(
                    (kits_dir / f"{row['kit']}.kit.json").read_text())["assets"]}
            asset = manifests[row["kit"]].get(aid)
            if asset is None:
                found.append(f"{aid} published")
                continue
            sources.append(("published", asset.get("anchorClass"),
                            (asset.get("designedSinkM") or {}).get("p50"),
                            asset.get("designedWaterlineM")))
        if aid in anchors and aid not in row_classes:
            sources.append(("record", anchors[aid].get("anchorClass"), None, None))
        bad: set[str] = set()
        for source, cls, sink, waterline in sources:
            if cls not in row["anchorClass"]:
                bad.add("anchorClass")
            elif source == "published" and cls == "water":
                if row["waterlineM"] and not _in(waterline, row["waterlineM"]):
                    bad.add("waterlineM")
            elif source == "published" and row["sinkM"] and not _in(sink, row["sinkM"]):
                bad.add("sinkM")
        found += [f"{aid} {field}" for field in sorted(bad)]
    pairs = {(p["child"], p["parent"]) for p in mounts.get("pairs", [])}
    for pair in truth["mountPairs"]:
        if (pair["child"], pair["parent"]) not in pairs:
            found.append(f"{pair['child']} pair")
        if (anchors.get(pair["child"]) or {}).get("anchorClass") != pair["class"]:
            found.append(f"{pair['child']} pairClass")
    run = truth["wallRun"]
    # The bundle names run pieces `<parcel id>.piece.<n>` in run order.
    marker = run["parcelId"] + ".piece."
    pieces = sorted((p for p in placements if marker in p["id"]),
                    key=lambda p: int(p["id"].rsplit(".", 1)[-1]))
    if [p["assetId"] for p in pieces] != run["order"]:
        found.append(f"{run['parcelId']} order")
    for a, b in zip(pieces, pieces[1:]):
        pitch = math.dist(a["positionM"][::2], b["positionM"][::2])
        if abs(pitch - run["pitchM"]) > run["toleranceM"]:
            found.append(f"{b['assetId']} pitch")
    return found


def test_the_yard_truth_table_covers_every_published_yard_asset():
    truth = json.loads(TRUTH.read_text())
    listed = {row["assetId"] for row in truth["assets"]}
    bundle = json.loads(PUBLISHED.read_text())
    used = {p["assetId"] for p in bundle["placements"] if p["id"].startswith(YARD + ".")}
    assert used and used <= listed, sorted(used - listed)


def test_the_published_yard_assets_match_the_truth_table():
    truth = json.loads(TRUTH.read_text())
    bundle = json.loads(PUBLISHED.read_text())
    placements = [p for p in bundle["placements"] if p["id"].startswith(YARD + ".")]
    found = yard_truth_mismatches(truth, KITS, json.loads(MOUNTS_RECORD.read_text()),
                                  placements, frozenset(_row_classes()))
    known = sorted(row["key"] for row in truth["knownMismatches"])
    assert sorted(found) == known


def test_the_truth_table_check_can_fail():
    truth = json.loads(TRUTH.read_text())
    bundle = json.loads(PUBLISHED.read_text())
    placements = [p for p in bundle["placements"] if p["id"].startswith(YARD + ".")]
    mounts = json.loads(MOUNTS_RECORD.read_text())
    mounts["anchors"] = dict(mounts["anchors"])
    mounts["anchors"][SCONCE] = {**mounts["anchors"][SCONCE], "anchorClass": "ground"}
    moved = [dict(p, positionM=[*p["positionM"][:2], p["positionM"][2] + 1.0])
             if p["id"].endswith("imperial-wall-run.piece.4") else p for p in placements]
    found = yard_truth_mismatches(truth, KITS, mounts, moved)
    assert f"{SCONCE} anchorClass" in found and f"{SCONCE} pairClass" in found
    assert any(key.endswith(" pitch") for key in found)


# --- 0099 decision 7: every check-in 1-3 yard defect is a gate on A and B ----
# The yard is never walked again. The mapping (defect -> cause -> gate) is the
# table in the 16h brief § Part 1 state, "Check-in 1-3 defects as gates".
YARD_B = "place.fixture.proving-ground-b"
YARDS = (YARD, YARD_B)
VEGETATION = PUBLISHED.parent / "vegetation"
#: The runtime's joint tolerance (`anchoring.ts` RUN_JOINT_TOLERANCE_M).
RUN_JOINT_TOLERANCE_M = 0.005
#: The door apron the exporter writes (`export_settlement_bundle._attach_door_apron`).
DOOR_APRON_M = 1.5


def _place_rows(bundle: dict, place: str) -> list[dict]:
    ids = set(next(s for s in bundle["settlements"] if s["id"] == place)["placementIds"])
    return [p for p in bundle["placements"] if p["id"] in ids]


def run_contract_failures(bundle: dict, place: str) -> list[str]:
    """C3-2: every piece of a laid run (`.piece.<n>` placement) carries the
    exporter's `run` {id, index, riseM} and a footprint, one run's indexes are
    0..n-1, and each `riseM` is the rise the compile lays for that piece from
    the authored blueprint (`blueprint_footprints.lay_pieces`, the mined
    abuts pairs), so the runtime can seat the run as one rigid chain
    (`anchoring.ts anchorRun`, proven by `runs.test.ts`). Before 259b200a the
    export dropped the field and every piece was re-seated on its own ground:
    the north end sat 5.6 cm high against the gate."""
    bp_path = {YARD: BLUEPRINT,
               YARD_B: BLUEPRINT.with_name("place.fixture.proving-ground-b.json")}[place]
    parcels = {pc["id"]: pc for pc in json.loads(bp_path.read_text())["blueprint"]["parcels"]
               if "pieces" in pc}
    laid = {pid: cs.fp_mod.lay_pieces(pc)[0] for pid, pc in parcels.items()}
    out, runs = [], {}
    for p in _place_rows(bundle, place):
        if ".piece." not in p["id"]:
            continue
        run = p.get("run")
        if not run or not {"id", "index", "riseM"} <= set(run) or not p.get("footprintM"):
            out.append(f"{p['id']}: no run contract or no footprint")
            continue
        runs.setdefault(run["id"], []).append(run)
        parcel_id = p["id"][len(place) + 1:].split(".piece.")[0]
        rows = laid.get(parcel_id) or []
        if not 0 <= run["index"] < len(rows):
            out.append(f"{p['id']}: index {run['index']} outside the laid run")
        elif abs(float(run["riseM"]) - float(rows[run["index"]].get("riseM", 0.0))) > RUN_JOINT_TOLERANCE_M:
            out.append(f"{p['id']}: riseM {run['riseM']} but the compile lays "
                       f"{rows[run['index']].get('riseM', 0.0)}")
    for run_id, members in runs.items():
        if sorted(m["index"] for m in members) != list(range(len(members))):
            out.append(f"{run_id}: indexes {sorted(m['index'] for m in members)}")
    return out


@pytest.mark.parametrize("place", YARDS)
def test_every_yard_run_piece_carries_its_run_contract(place):
    bundle = json.loads(PUBLISHED.read_text())
    assert any(".piece." in p["id"] for p in _place_rows(bundle, place)), place
    assert run_contract_failures(bundle, place) == []


def test_the_run_contract_check_fails_on_the_pre_fix_export_and_on_a_wrong_rise():
    bundle = json.loads(PUBLISHED.read_text())
    wrong = json.loads(json.dumps(bundle))
    piece = next(p for p in wrong["placements"] if p["id"].startswith(YARD + ".") and p.get("run"))
    piece["run"]["riseM"] = float(piece["run"]["riseM"]) + 0.3
    assert any("but the compile lays" in f for f in run_contract_failures(wrong, YARD))
    for p in bundle["placements"]:
        p.pop("run", None)          # what the v2 exporter published
    assert run_contract_failures(bundle, YARD)


def _run_seats(bundle: dict, survey, place: str) -> dict[str, float]:
    """placement id -> pivot y of every run member, seated as one rigid chain
    (`anchoring.ts anchorRun`): the datum is the member with the highest mean
    ground under its own footprint, at that mean less its sink; every other
    member at y_datum + riseM_i - riseM_datum. `ground_audit` uses it so the
    float and visibility gates judge a run where the runtime puts it."""
    runs: dict[str, list] = {}
    for p in _place_rows(bundle, place):
        if p.get("run") and p.get("footprintM"):
            runs.setdefault(p["run"]["id"], []).append(p)
    out = {}
    for members in runs.values():
        means = [sum(survey.height_at(float(x), float(z)) for x, z in p["footprintM"])
                 / len(p["footprintM"]) for p in members]
        d = max(range(len(members)), key=lambda i: means[i])
        datum = means[d] - float(members[d]["anchor"]["designedSinkM"]["p50"]) * float(
            members[d].get("scale", 1.0))
        for p in members:
            out[p["id"]] = datum + float(p["run"]["riseM"]) - float(members[d]["run"]["riseM"])
    return out


def scatter_in_door_aprons(bundle: dict, place: str, patches: list[dict] | None = None,
                           radius_m: float = DOOR_APRON_M) -> list[str]:
    """C3-5: no scatter instance stands within the door apron of a yard door
    (the algrass03b bush 0.52 m from the farmhouse threshold) once the
    published clearance patches are applied to the published bundle, in
    memory, exactly as `apply_vegetation_patches` applies them. The bundles
    on disk carry the patches from the next province publish on (standard 6
    holds them to the release); this gate proves the patch record clears the
    door, whatever the publish state."""
    from .apply_vegetation_patches import _prune_decoded, species_radii
    from .compile_scatter import DEFAULT_SEED
    from .scatter import decode
    from .vegetation_patches import CHUNK_M, affected_chunks
    if patches is None:
        patches = json.loads((PUBLISHED.parent / "vegetation-patches.json").read_text())["patches"]
    index = json.loads((VEGETATION / "vegetation-index.json").read_text())
    species = index.get("speciesOrder", [])
    radii = species_radii()
    out = []
    for door in bundle["doors"]:
        if door.get("settlementId") != place:
            continue
        x, z = door["thresholdM"]
        cx, cz = int(x // CHUNK_M), int(z // CHUNK_M)
        path = VEGETATION / f"chunk_{cx}_{cz}_vegetation.bin"
        if not path.exists():
            continue
        groups = decode(path.read_bytes())
        for patch in patches:
            if (cx, cz) in {tuple(c) for c in affected_chunks(patch)}:
                _prune_decoded(groups, species, patch, DEFAULT_SEED, radii)
        for group in groups:
            for inst in group["instances"]:
                d = math.hypot(inst["x"] - x, inst["z"] - z)
                if d < radius_m:
                    out.append(f"{door['id']}: {species[group['index']]} at {d:.2f} m")
    return out


@pytest.mark.parametrize("place", YARDS)
def test_no_scatter_stands_in_a_yard_door_apron(place):
    bundle = json.loads(PUBLISHED.read_text())
    assert any(d.get("settlementId") == place for d in bundle["doors"]), place
    assert scatter_in_door_aprons(bundle, place) == []


def test_the_apron_check_fails_without_the_settlement_patches():
    """Without the `patch.clearance.settlement.*` set the farmhouse bush stands
    at the door, as the owner saw it at check-in 3."""
    bundle = json.loads(PUBLISHED.read_text())
    patches = [p for p in json.loads((PUBLISHED.parent / "vegetation-patches.json").read_text())["patches"]
               if not p["id"].startswith("patch.clearance.settlement.")]
    assert any("algrass03b" in hit for hit in scatter_in_door_aprons(bundle, YARD, patches))


def _glb_json(path: Path) -> dict:
    import struct
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


def undecaled_materials(bundle: dict, place: str) -> list[str]:
    """C3-3: every material a yard kit's manifest lists in `decalMaterials`
    (the NIF's SLSF1 Decal / Dynamic_Decal overlay) ships with the glTF
    material extra `decal: true`, the field the settlement runtime biases
    (`materials.ts applySettlementDecal`). The skirting flicker was
    impfreewall01's ImpDirt overlay z-fighting its band with no flag."""
    public = PUBLISHED.parent.parent
    kits = {p["kit"] for p in _place_rows(bundle, place)}
    out = []
    for kit_id in sorted(kits):
        kit = bundle["kits"][kit_id]
        manifest = json.loads((public / kit["manifest"]).read_text())
        wanted = {m for a in manifest["assets"] for m in a.get("decalMaterials", [])}
        flagged = {m.get("name") for m in _glb_json(public / kit["glb"]).get("materials", [])
                   if (m.get("extras") or {}).get("decal")}
        out += [f"{kit_id} {m}" for m in sorted(wanted - flagged)]
    return out


@pytest.mark.parametrize("place", YARDS)
def test_every_yard_decal_material_ships_flagged(place):
    bundle = json.loads(PUBLISHED.read_text())
    manifest = json.loads((PUBLISHED.parent.parent / bundle["kits"]["settlement-imperial-v1"]["manifest"]).read_text())
    wall = next(a for a in manifest["assets"] if a["id"] == "vanilla:dungeons/imperial/clutterkits/impfreewall01")
    assert wall.get("decalMaterials"), "impfreewall01's ImpDirt overlay is not recorded as a decal"
    assert undecaled_materials(bundle, place) == []


RAW_KITS = REPO_ROOT / "tooling/asset-pipeline/output/kits"
#: Composite -> (kit, the NIF shape names of its door leaf). Leaves at a
#: nonzero part yaw are the ones a sign error turns; the stilt house leaf is
#: the check-in 2 fix.
LEAF_SHAPES = {
    "composite:stilt/bamboohut01-with-door": ("settlement-stilt-v1", ("es|Door01:",)),
    "composite:stilt/bamboohut02-with-door": ("settlement-stilt-v1", ("es|Door01:",)),
    "composite:stilt/stilthouse-with-door": ("settlement-stilt-v1", ("es|RiftenDoor02",)),
}
LEAF_PLANE_DEG = 10.0


def _leaf_vertices(kit: str, composite: str, shapes: tuple[str, ...]):
    """The leaf's full-detail vertices in the composite's z-up frame (x east,
    y north), read from the raw built GLB (transforms are baked)."""
    import struct
    import numpy as np
    data = (RAW_KITS / f"{kit}.glb").read_bytes()
    gltf = _glb_json(RAW_KITS / f"{kit}.glb")
    length = struct.unpack_from("<I", data, 12)[0]
    binary = data[20 + length + 8:]
    node_name = "composite__" + composite.removeprefix("composite:").replace("/", "_")
    parent = next(n for n in gltf["nodes"] if n.get("name", "").endswith(node_name))
    out = []
    for child in parent.get("children", []):
        node = gltf["nodes"][child]
        if "__lod" in node["name"] or not node["name"].startswith(shapes):
            continue
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            acc = gltf["accessors"][prim["attributes"]["POSITION"]]
            view = gltf["bufferViews"][acc["bufferView"]]
            start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
            xyz = np.frombuffer(binary, np.float32, acc["count"] * 3, start).reshape(-1, 3)
            out.append(np.column_stack([xyz[:, 0], -xyz[:, 2]]))    # glTF y-up -> plan (x, north)
    return np.concatenate(out)


def leaf_off_plane_deg(xy) -> float:
    """Angle between the leaf's thin plan axis and the radial line through its
    centre (the doorway's normal in a round hut, and at the stilt house's
    centred front door), folded to 0-90 deg."""
    import numpy as np
    centre = xy.mean(axis=0)
    evals, evecs = np.linalg.eigh(np.cov((xy - centre).T))
    thin = evecs[:, 0]
    radial = centre / np.linalg.norm(centre)
    cos = abs(float(thin @ radial))
    return math.degrees(math.acos(min(1.0, cos)))


@pytest.mark.parametrize("composite", sorted(LEAF_SHAPES))
def test_every_yard_door_leaf_lies_in_the_plane_of_its_doorway(composite):
    """C3-4: the bamboo hut leaf copied mined yaw 120 and the old importer
    turned it the other way, 60 deg across its doorway. Reads the BUILT
    geometry, so it gates the importer's sign, not the config."""
    kit, shapes = LEAF_SHAPES[composite]
    if not (RAW_KITS / f"{kit}.glb").exists():
        pytest.skip(f"raw kit {kit} not built on this machine")
    assert leaf_off_plane_deg(_leaf_vertices(kit, composite, shapes)) <= LEAF_PLANE_DEG


def test_the_leaf_plane_check_fails_on_the_old_importer_turn():
    """The leaf turned by -120 instead of +120 about its own centre (the
    pre-fix `import_composite`) fails the gate."""
    import numpy as np
    kit, shapes = LEAF_SHAPES["composite:stilt/bamboohut01-with-door"]
    if not (RAW_KITS / f"{kit}.glb").exists():
        pytest.skip(f"raw kit {kit} not built on this machine")
    xy = _leaf_vertices(kit, "composite:stilt/bamboohut01-with-door", shapes)
    centre = xy.mean(axis=0)
    a = math.radians(240.0)           # counter-clockwise: clockwise 120 undone, counter-clockwise 120 applied
    rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    assert leaf_off_plane_deg((xy - centre) @ rot.T + centre) > LEAF_PLANE_DEG
