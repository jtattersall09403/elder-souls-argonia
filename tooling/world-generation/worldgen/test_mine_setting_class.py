"""decision 0105 R1: the setting-class miner's location reading and the record
it wrote (the manifests carry it through placement_metadata)."""
import json

from worldgen import mine_setting_class as msc
from worldgen.mine_setting_class import WILD, classify, excluded

KW = {1: "LocTypeInn", 2: "LocTypeCity", 3: "LocTypeFarm", 4: "LocTypeDungeon",
      5: "LocTypeHabitation"}
LOC = {10: ("InnLoc", [1, 5], 20), 20: ("CityLoc", [2, 5], 30), 30: ("HoldLoc", [], None),
       40: ("FarmLoc", [3, 5], 30), 50: ("CaveLoc", [4], 30), 60: ("Loop", [], 60)}


def test_classify_walks_parents_and_takes_the_highest_class():
    assert classify(10, KW, LOC) == ("town", "InnLoc")      # inn inside a city
    assert classify(40, KW, LOC) == ("village", "FarmLoc")
    assert classify(50, KW, LOC) == ("ruin", "CaveLoc")
    assert classify(30, KW, LOC) == (WILD, "HoldLoc")       # a hold is no class
    assert classify(None, KW, LOC) == (WILD, None)
    assert classify(60, KW, LOC) == (WILD, "Loop")          # a PNAM cycle ends


def test_storage_and_test_cells_never_vote():
    assert excluded("WarehouseFences", None)
    assert excluded("NavMeshGenCellDUPLICATE001", None)
    assert excluded(None, "CWTestHold")
    assert not excluded("WhiterunBanneredMare", None)
    assert not excluded(None, "Tamriel")


def test_record_licences_match_the_rule():
    record = json.loads(msc.DEFAULT_OUT.read_text())
    assert record["schemaVersion"] == 1
    rows = record["assets"]
    sconce = rows["vanilla:clutter/imperial/impwallsconcecandle01"]
    assert "exterior" not in sconce["settings"] and "interior" in sconce["settings"]
    lantern = rows["vanilla:clutter/common/candlelanternwithcandle01"]
    assert "village" in lantern["settings"]["exterior"]
    for asset_id, row in rows.items():
        assert row["evidence"] == ("plugin" if row["n"] else "unplaced"), asset_id
        assert row["n"] == sum(row["interior"].values()) + sum(row["exterior"].values())
        if not row["n"]:
            assert row["settings"] == {}, asset_id


def test_r15_the_craft_are_the_watercraft_kits_hulls_and_oars():
    """0105 R15: vehicles are the watercraft kit's entries less the pieces
    that are no craft; the committed record flags the craft it mined."""
    from . import mine_setting_class as msc
    craft = msc.vehicle_assets()
    assert "canoe:actors/sfss/canoe/canoe1" in craft and "rowboats:dungeons/clutter/shipoar01" in craft
    assert not craft & msc.NOT_VEHICLES and "canoe:weapons/sfss/anchor" not in craft
    record = json.loads(msc.DEFAULT_OUT.read_text())
    flagged = {a for a, row in record["assets"].items() if row.get("vehicle")}
    assert flagged == {a for a in record["assets"] if a in craft}
    assert "vanilla:clutter/barrel01" not in flagged
