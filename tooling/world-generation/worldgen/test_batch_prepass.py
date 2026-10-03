"""The batch pre-pass claim table (16k S16): the lookup gives the plugin-read
claims exactly, the table refuses a moved input or a missing cell loudly with
the rebuild command (and `--claim` then reads the plugins with a warning), and
the kit plan and site budget read what is on disk."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from . import batch_prepass as bpp
from . import blueprint_interiors as bi
from .test_blueprint_interiors_claim import LIB, LINKS, PROFILE, _bp

PLACE = "place.test.fixture"
SOURCING = {"Home": {"unsourced": [], "misses": {}, "gate": []},
            "Shop": {"unsourced": ["vanilla:clutter/x"], "misses": {"clutter": 1}, "gate": []},
            "Chapel": {"unsourced": [], "misses": {"architecture": 1}, "gate": []}}


def _sourcing(plugin, cell):
    return copy.deepcopy(SOURCING.get(cell, {"unsourced": [], "misses": {}, "gate": []}))


def _kits_of(plugin, cell):
    return {"kits": ["interior-test"], "missingAssets": ["test:missing"] if cell == "Shop" else []}


def _profile(plugin, cell, shell):
    return copy.deepcopy(PROFILE(plugin, cell, shell))


@pytest.fixture
def world(tmp_path):
    blueprints = tmp_path / "blueprints"
    blueprints.mkdir()
    bp = _bp(["lodging"])
    bp["id"] = PLACE
    (blueprints / "place.test.fixture.json").write_text(json.dumps({"schemaVersion": 1, "blueprint": bp}))
    (blueprints / "fixture.layout.json").write_text(json.dumps(
        {"schemaVersion": 1, "placeId": PLACE, "ops": [{"asset": "test:bare"}, {"asset": "test:shell"}]}))
    source = tmp_path / "links.json"
    source.write_text("links v1")
    plugin = tmp_path / "A.esp"
    plugin.write_bytes(b"TES4")

    def rows_of(plugins):
        return ([("links.json", source, "content")]
                + [(f"plugin:{n}", Path(p), "stamp") for n, p in sorted(plugins.items())])
    return {"dir": blueprints, "source": source, "rows_of": rows_of, "table": tmp_path / "claim-table.json",
            "plugins": {"A.esp": str(plugin)}, "tmp": tmp_path}


def _current(world, plugins=None):
    found = world["plugins"] if plugins is None else plugins
    return bpp.current_table(world["table"], world["rows_of"], plugins_of=lambda: found)


def _table(world) -> dict:
    return bpp.build_table([PLACE], LINKS, world["plugins"], _profile, _sourcing, _kits_of, None,
                           rows_of=world["rows_of"], blueprints_dir=world["dir"])


def test_shells_come_from_blueprint_and_layout_and_only_linked_ones(world):
    assert bpp.batch_shells([PLACE], LINKS, world["dir"]) == ["test:shell"]
    with pytest.raises(SystemExit):
        bpp.batch_shells(["place.nowhere"], LINKS, world["dir"])


def test_a_slug_resolves_to_its_one_place_id(world):
    assert bpp.resolve_places(["fixture"], world["dir"]) == [PLACE]
    assert bpp.resolve_places([PLACE], world["dir"]) == [PLACE]
    with pytest.raises(SystemExit):
        bpp.resolve_places(["nowhere"], world["dir"])
    (world["dir"] / "other.layout.json").write_text(json.dumps(
        {"schemaVersion": 1, "placeId": "place.other.fixture", "ops": []}))
    with pytest.raises(SystemExit):          # two ids end `.fixture`
        bpp.resolve_places(["fixture"], world["dir"])


@pytest.mark.parametrize("services", [["lodging"], ["trader"], ["smith"], []])
def test_lookup_claims_equal_the_plugin_read_claims(world, services):
    doc = _table(world)
    bpp.write_table(doc, world["table"])
    table = _current(world)
    old, new = _bp(services), _bp(services)
    rows_old = bi.claim_doors(old, LIB, LINKS, _profile, sourcing=_sourcing)
    rows_new = bi.claim_doors(new, LIB, LINKS, table.profile, sourcing=table.sourcing)
    assert json.dumps(rows_new) == json.dumps(rows_old)
    assert json.dumps(new) == json.dumps(old)


def test_a_moved_input_refuses_with_the_rebuild_command(world):
    bpp.write_table(_table(world), world["table"])
    assert _current(world) is not None
    world["source"].write_text("links v2")
    with pytest.raises(bpp.TableError) as err:
        _current(world)
    assert "stale, 1 input(s) moved" in err.value.message and "links.json" in err.value.message
    assert f"worldgen.batch_prepass --places {PLACE}" in err.value.message


def test_a_cell_outside_the_table_refuses(world):
    doc = _table(world)
    table = bpp.ClaimTable(doc, world["table"])
    with pytest.raises(bpp.TableError) as err:
        table.profile("Test.esm", "Home", "test:other")
    assert "no entry" in err.value.message and "batch_prepass --places" in err.value.message
    assert bpp.current_table(world["table"].with_name("absent.json"), world["rows_of"],
                             plugins_of=lambda: {}) is None


def test_a_plugin_discovered_after_the_table_refuses(world):
    """The check hashes the plugins discovery finds NOW (a pool or an
    EXTRA_POOL_PLUGINS row added later), not the set the table recorded."""
    bpp.write_table(_table(world), world["table"])
    extra = world["tmp"] / "B.esp"
    extra.write_bytes(b"TES4")
    with pytest.raises(bpp.TableError) as err:
        _current(world, dict(world["plugins"], **{"B.esp": str(extra)}))
    assert "plugin:B.esp" in err.value.message


def test_a_previous_table_is_merged_only_when_its_inputs_match(world):
    first = _table(world)
    first["places"] = ["place.other"]
    first["pools"]["other"] = {"other:shell": {"cells": []}}
    merged = bpp.build_table([PLACE], LINKS, world["plugins"], _profile, _sourcing, _kits_of, first,
                             rows_of=world["rows_of"], blueprints_dir=world["dir"])
    assert merged["places"] == ["place.other", PLACE] and "other" in merged["pools"]
    world["source"].write_text("links v2")
    fresh = bpp.build_table([PLACE], LINKS, world["plugins"], _profile, _sourcing, _kits_of, first,
                            rows_of=world["rows_of"], blueprints_dir=world["dir"])
    assert fresh["places"] == [PLACE] and "other" not in fresh["pools"]


def _kit(dir_: Path, kit: str, assets: list[str], glb_bytes: int = 0) -> None:
    """A published kit (decision 0120): manifest, a parts index and one part
    of `glb_bytes` minus 100 B, plus a 100 B pool texture the part names."""
    (dir_ / f"{kit}.kit.json").write_text(json.dumps({"kit": kit, "assets": [{"id": a} for a in assets]}))
    parts = dir_ / kit / "parts"
    parts.mkdir(parents=True, exist_ok=True)
    (dir_ / "tex").mkdir(exist_ok=True)
    (dir_ / "tex" / f"{kit}.ktx2").write_bytes(b"t" * min(100, glb_bytes))
    (parts / "a.glb").write_bytes(b"x" * max(0, glb_bytes - 100))
    (parts / "index.json").write_text(json.dumps({"assets": {"a": {"file": "a.glb", "textures": [kit]}}}))


def test_kit_plan_builds_missing_stale_and_stamped_kits(tmp_path):
    configs, public, raw = (tmp_path / n for n in ("configs", "public", "raw"))
    for d in (configs, public, raw):
        d.mkdir()
    for kit, assets in {"k-missing": ["a:1"], "k-stale": ["a:2"], "k-stamped": [], "k-moved": [],
                        "k-plain": []}.items():
        (configs / f"{kit}.json").write_text(json.dumps({"id": kit, "assets": [{"asset": a} for a in assets]}))
    _kit(public, "k-stale", [])
    _kit(public, "k-stamped", [])
    _kit(public, "k-moved", [])
    _kit(public, "k-plain", [])
    # a stamp lists `<sha256> <label>`; a repo file whose content still
    # matches is current, one that moved sends the kit to build_kit
    tracked = "tooling/world-generation/worldgen/batch_prepass.py"
    now = bpp._sha256(bpp.REPO_ROOT / tracked)
    (raw / "k-stamped.inputs.sha256").write_text(f"d\n# sidecars:\n# outputs: o\n{now} {tracked}\nff (options)\n")
    (raw / "k-moved.inputs.sha256").write_text(f"d\n# sidecars:\n# outputs: o\n{'0' * 64} {tracked}\n")
    pools = {"p": {"s": {"cells": [{"kits": ["k-stamped", "k-moved", "k-plain"],
                                    "missingAssets": ["a:1", "a:2", "a:9"]}]}}}
    plan = bpp.kit_plan(pools, configs, public, raw)
    assert plan["build"] == ["k-missing", "k-moved", "k-stale"]
    assert tracked in plan["why"]["k-moved"]
    assert plan["unstamped"] == ["k-plain"] and plan["unlistedAssets"] == ["a:9"]


def test_budget_fails_over_the_compose_fail_line(tmp_path):
    compose = tmp_path / "compose.mjs"
    compose.write_text('const WARN_MB = Number(opt("--warn-mb", 0.001));\n'
                       'const FAIL_MB = Number(opt("--fail-mb", 0.002));\n')
    public, site = tmp_path / "public", tmp_path / "site"
    public.mkdir()
    (site / "studio" / "kits").mkdir(parents=True)
    _kit(public, "k-new", [], glb_bytes=1500)
    audio = tmp_path / "audio"
    audio.mkdir()
    ok, lines = bpp.budget_check(["k-new"], site, public, compose, audio)
    assert ok and lines[-1].endswith(": WARN")
    # compose.mjs:209 reserves the audio tree when no app ships a copy
    (audio / "a.ogg").write_bytes(b"x" * 1000)
    ok, lines = bpp.budget_check(["k-new"], site, public, compose, audio)
    assert not ok and "reserved audio" in lines[-1] and lines[-1].endswith(": FAIL")
    (site / "studio" / "audio").mkdir()
    (site / "studio" / "audio" / "audio-manifest.json").write_text("{}")
    ok, lines = bpp.budget_check(["k-new"], site, public, compose, audio)
    assert ok, lines[-1]
    (site / "studio" / "audio" / "audio-manifest.json").unlink()
    _kit(public, "k-new", [], glb_bytes=2500)
    (audio / "a.ogg").unlink()
    ok, lines = bpp.budget_check(["k-new"], site, public, compose, audio)
    assert not ok and lines[-1].endswith(": FAIL") and "NEW to the site" in lines[1]
    ok, lines = bpp.budget_check(["k-new"], tmp_path / "no-site", public, compose, audio)
    assert not ok and "compose.mjs" in lines[-1]


def test_a_stale_table_falls_back_to_the_plugin_reads_with_a_warning(world, monkeypatch, capsys):
    """Walk 3 L8 rec 2: a moved input once refused every claim (exit 2)."""
    bp_path = world["tmp"] / "bp.json"
    bp_path.write_text(json.dumps({"blueprint": {"parcels": [], "doors": []}}))

    def stale(*a, **k):
        raise bpp.TableError("claim table x is stale, 1 input(s) moved since it was built")
    monkeypatch.setattr(bpp, "current_table", stale)
    seen = {}

    def claim_doors(bp, profile=None, sourcing=None):
        seen["profile"], seen["sourcing"] = profile, sourcing
        return []
    monkeypatch.setattr(bi, "claim_doors", claim_doors)
    assert bi.claim_main(bp_path, []) == 0
    assert seen == {"profile": bi.plugin_profile, "sourcing": bi.bundle_sourcing}
    assert "WARNING claim table x is stale" in capsys.readouterr().err


def test_a_cell_outside_the_table_is_read_from_its_plugin_with_a_warning(world, monkeypatch, capsys):
    table = bpp.ClaimTable(_table(world), world["table"])
    monkeypatch.setattr(bi, "plugin_profile", lambda p, c, s: {"read": (p, c, s)})
    monkeypatch.setattr(bi, "bundle_sourcing", lambda p, c: {"read": (p, c)})
    profile, sourcing = bi.table_or_plugin(table, bpp.TableError)
    assert profile("Test.esm", "Home", "test:other") == {"read": ("Test.esm", "Home", "test:other")}
    assert sourcing("Nowhere.esp", "Home") == {"read": ("Nowhere.esp", "Home")}
    assert capsys.readouterr().err.count("WARNING") == 2
    hit = next(iter(table._profile))
    assert profile(*hit) == table.profile(*hit)                  # an entry is still a lookup


def test_kit_plan_warns_when_builder_code_moved_without_a_version_bump(tmp_path):
    """L9 rec 5: the code digest is an informational stamp line; a stamp at
    the current output-format version whose code digest moved is a warning
    (never a rebuild), and the `(output-format)` label is the version, not a
    file (a current one never reads as moved)."""
    bk = bpp._build_kit()
    configs, public, raw = (tmp_path / n for n in ("configs", "public", "raw"))
    for d in (configs, public, raw):
        d.mkdir()
    version = bk.KIT_OUTPUT_FORMAT_VERSION
    for kit, code in (("k-same", bk.kit_code_digest()), ("k-edited", "0" * 64), ("k-old", "0" * 64)):
        (configs / f"{kit}.json").write_text(json.dumps({"id": kit, "assets": []}))
        _kit(public, kit, [])
        v = version - 1 if kit == "k-old" else version
        (raw / f"{kit}.inputs.sha256").write_text(
            f"d\n# sidecars:\n# outputs: o\n{bk.CODE_STAMP_PREFIX}{code} output-format {v}\n"
            f"{v} (output-format)\n")
    plan = bpp.kit_plan({"p": {"s": {"cells": [{"kits": ["k-same", "k-edited", "k-old"]}]}}},
                        configs, public, raw)
    assert plan["codeMovedWithoutBump"] == ["k-edited"]
    assert plan["build"] == ["k-old"] and "(output-format)" in plan["why"]["k-old"]
