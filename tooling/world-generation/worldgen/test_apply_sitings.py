"""Command-level contracts for the siting write-back chain."""

import json
import sys

from . import apply_sitings


def _write(path, rows):
    path.write_text(json.dumps({"schemaVersion": 1, "overrides": rows}, indent=1) + "\n",
                    encoding="utf-8")


def test_a_plot_remedies_row_survives_an_apply(tmp_path):
    """The overrides file is shared. `apply_sitings` re-derives its own
    blueprint-sourced rows and must preserve every other source's rows verbatim
    — re-deriving the whole file once dropped 11 `plot-remedies` rows."""
    path = tmp_path / "macro-plot-overrides.json"
    remedy_row = {"id": "place.testland.alpha", "u": 0.1, "v": 0.2,
                  "why": "60 m east onto the channel", "source": "plot-remedies"}
    stale_blueprint = {"id": "place.testland.beta", "u": 0.9, "v": 0.9, "why": "old",
                       "source": "world/sources/blueprints/place.testland.beta.json",
                       "candidateId": "c0"}
    _write(path, [remedy_row, stale_blueprint])

    fresh = [{"id": "place.testland.beta", "u": 0.5, "v": 0.5, "why": "new",
              "source": "world/sources/blueprints/place.testland.beta.json",
              "candidateId": "c1"}]
    merged = apply_sitings.merge_overrides(fresh, path=path)

    assert remedy_row in merged                      # preserved verbatim
    assert stale_blueprint not in merged             # blueprint rows are re-derived
    assert fresh[0] in merged
    assert len(merged) == 2
    assert [o["id"] for o in merged] == sorted(o["id"] for o in merged)


def test_merge_overrides_on_a_missing_file_is_the_blueprint_rows(tmp_path):
    fresh = [{"id": "place.a", "u": 0.1, "v": 0.1, "why": "w",
              "source": "world/sources/blueprints/place.a.json"}]
    assert apply_sitings.merge_overrides(fresh, path=tmp_path / "nope.json") == fresh


def test_replot_is_a_true_whole_province_resolve():
    assert apply_sitings.replot_command() == [
        sys.executable, "-m", "worldgen.macro_plot", "--resolve-all",
    ]


# ------------------------------------------------------------------ reseat

def _survey():
    """The three things a reseat reads: the uv frame and the water record."""
    from types import SimpleNamespace

    def water_at(x, z):
        return {"id": "body.test", "kind": "lake", "depthM": 3.0} if x > 5000 else None

    return SimpleNamespace(uv_to_m=lambda u, v: (u * 10000.0, v * 10000.0),
                           m_to_uv=lambda x, z: (x / 10000.0, z / 10000.0),
                           water_at=water_at)


def _catalogue(tmp_path, monkeypatch, places):
    from . import catalogue, plot_remedies
    path = tmp_path / "places-testland.json"
    path.write_text(json.dumps({"schemaVersion": catalogue.PLACES_SCHEMA_VERSION,
                                "region": "testland", "seed": "s", "places": places},
                               indent=1) + "\n", encoding="utf-8")
    monkeypatch.setattr(catalogue, "CATALOGUE_DIR", tmp_path)
    monkeypatch.setattr(plot_remedies, "load_type_recipes",
                        lambda *a, **k: {"cliff-shelf-village": {"proximity": {"minFromClassM": {"settlement": 400}}},
                                         "drowned-village": {}})
    monkeypatch.setattr(apply_sitings, "RESEAT_RECEIPTS_PATH", tmp_path / "reseat-receipts.json")
    from types import SimpleNamespace
    from . import macro_plot
    monkeypatch.setattr(macro_plot, "pinned_candidate",
                        lambda s, rid, x, z: SimpleNamespace(landform="seated", region="lake & standing water",
                                                             danger=1, route_m=120.0, water_m=8.0))
    monkeypatch.setattr(apply_sitings, "measure_facts",
                        lambda s, x, z, fields: {"distanceToWaterM": 8.0,
                                                 "water": {"entityId": "body.test", "kind": "lake",
                                                           "levelM": 1.0, "season": "perennial",
                                                           "distanceM": 8.0}})
    return path


def _place(rid, x, z, typ="cliff-shelf-village", **over):
    rec = {"id": rid, "status": "active", "workflow": "plotted",
           "classification": {"class": "settlement", "family": "dry-village", "type": typ},
           "positionM": [x, z], "position": {"u": x / 10000.0, "v": z / 10000.0},
           "plotFacts": {"landform": "old"}, "whySiteWon": "old", "candidatesConsidered": []}
    rec.update(over)
    return rec


def _row(rid, x, z):
    return {"id": rid, "u": x / 10000.0, "v": z / 10000.0, "kind": "reseat",
            "source": "plot-remedies", "ownerCall": "2026-09-20",
            "sources": ["water graph body.test"], "why": "the island centroid"}


def test_a_reseat_moves_exactly_one_record(tmp_path, monkeypatch):
    """The defect: no stage could move an already-committed record; the only
    mechanism, `macro_plot --resolve-all`, moved 106 unrelated records."""
    path = _catalogue(tmp_path, monkeypatch,
                      [_place("place.testland.alpha", 1000.0, 1000.0),
                       _place("place.testland.beta", 3000.0, 3000.0),
                       _place("place.testland.gamma", 4000.0, 1000.0)])
    before = json.loads(path.read_text())["places"]
    s = _survey()
    dry, dry_errors = apply_sitings.apply_reseats(s, [_row("place.testland.alpha", 1600.0, 2400.0)], apply=False, catalogue_dir=tmp_path)
    assert not dry_errors and len(dry) == 1 and dry[0]["movedM"] == 1523.2
    assert json.loads(path.read_text())["places"] == before      # dry run changed nothing

    receipts, errors = apply_sitings.apply_reseats(s, [_row("place.testland.alpha", 1600.0, 2400.0)], catalogue_dir=tmp_path)
    assert not errors and [r["id"] for r in receipts] == ["place.testland.alpha"]
    after = {r["id"]: r for r in json.loads(path.read_text())["places"]}
    assert after["place.testland.alpha"]["positionM"] == [1600.0, 2400.0]
    for rid in ("place.testland.beta", "place.testland.gamma"):
        assert after[rid] == next(r for r in before if r["id"] == rid)
    assert json.loads((tmp_path / "reseat-receipts.json").read_text())["receipts"][0]["ownerCall"] == "2026-09-20"


def test_a_reseat_onto_water_is_refused_for_a_land_record(tmp_path, monkeypatch):
    path = _catalogue(tmp_path, monkeypatch, [_place("place.testland.alpha", 1000.0, 1000.0)])
    before = path.read_bytes()
    receipts, errors = apply_sitings.apply_reseats(_survey(), [_row("place.testland.alpha", 6000.0, 1000.0)], catalogue_dir=tmp_path)
    assert not receipts and len(errors) == 1 and "is a land record" in errors[0], errors
    assert path.read_bytes() == before


def test_a_reseat_into_a_neighbours_isolation_floor_is_refused(tmp_path, monkeypatch):
    _catalogue(tmp_path, monkeypatch,
               [_place("place.testland.alpha", 1000.0, 1000.0),
                _place("place.testland.beta", 3000.0, 3000.0)])
    _, errors = apply_sitings.apply_reseats(_survey(), [_row("place.testland.alpha", 2900.0, 3000.0)], catalogue_dir=tmp_path)
    assert len(errors) == 1 and "keeps 400 m from class 'settlement'" in errors[0], errors


def test_a_reseat_needing_water_is_refused_on_dry_ground(tmp_path, monkeypatch):
    _catalogue(tmp_path, monkeypatch,
               [_place("place.testland.alpha", 1000.0, 1000.0, typ="drowned-village",
                       sitingPrefs={"minDepthM": 1.0})])
    _, errors = apply_sitings.apply_reseats(_survey(), [_row("place.testland.alpha", 1600.0, 2400.0)], catalogue_dir=tmp_path)
    assert len(errors) == 1 and "needs water" in errors[0], errors
