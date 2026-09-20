"""The quest data validates, and docs/quests/index/ is a fresh render of it."""

import json
from pathlib import Path

import pytest

from . import catalogue, quests as Q
from .export_quest_index import OUT_DIR, build

HAVE_CATALOGUE = any(catalogue.CATALOGUE_DIR.glob("places-*.json"))
HAVE_QUESTS = (Q.QUEST_DIR / "lines.json").exists()
skip = pytest.mark.skipif(not (HAVE_CATALOGUE and HAVE_QUESTS),
                          reason="no catalogue/quest data committed")


@skip
def test_quest_data_checks_clean(capsys):
    """`python3 -m worldgen.quests --check` in one call — ids, lines, shapes,
    anchors against LIVE catalogue records, the §47c shape budget, and registry
    parity in both directions."""
    errors = Q.check()
    assert errors == [], "\n".join(errors)


@skip
def test_every_region_owns_exactly_one_local_packet():
    for region in Q.region_names():
        path = Q.QUEST_DIR / f"local-{region}.json"
        assert path.exists(), f"{path.name} missing — region agents need one file each"


@skip
def test_ids_are_globally_unique_and_sorted():
    ids = [q["id"] for q in Q.load_quests()]
    assert ids == sorted(ids)
    assert len(ids) == len(set(ids))


@skip
def test_index_docs_are_fresh(tmp_path: Path):
    """A data edit without `python3 -m worldgen.export_quest_index` fails here."""
    stale = []
    for name, text in build().items():
        path = OUT_DIR / name
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            stale.append(name)
    assert not stale, ("docs/quests/index/ is stale — run "
                       "`python3 -m worldgen.export_quest_index` from "
                       f"tooling/world-generation ({', '.join(stale)})")


@skip
def test_generated_docs_carry_the_generated_header():
    for name, text in build().items():
        assert text.startswith("<!-- GENERATED"), name
        assert text.endswith("\n"), name


@skip
def test_registry_render_is_byte_stable():
    a = Q.build_registry()
    assert Q.build_registry() == a


def _catalogue_copy(tmp_path: Path) -> Path:
    """A scratch copy of the live catalogue, safe to break on purpose."""
    out = tmp_path / "catalogue"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.mkdir()
    for src in sorted(catalogue.CATALOGUE_DIR.glob("*.json")):
        (out / src.name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return out


def _edit(cat_dir: Path, place_id: str, mutate) -> None:
    region = place_id.split(".")[1]
    path = cat_dir / f"places-{region}.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    for rec in doc["places"]:
        if rec["id"] == place_id:
            mutate(rec)
            break
    else:                                    # pragma: no cover - test bug
        raise AssertionError(f"{place_id} not in {path.name}")
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


@skip
def test_an_anchor_on_an_unsited_record_fails(tmp_path: Path):
    """A quest anchored on a record with no dot has nowhere to be played
    (owner 2026-09-20: the cut of the unsited 13)."""
    cat = _catalogue_copy(tmp_path)
    pid = "place.dunmer-north.nine-fords"
    _edit(cat, pid, lambda rec: (rec.pop("position", None), rec.pop("positionM", None)))
    errors = Q.check(catalogue_dir=cat)
    assert any(f"anchorPlace {pid} is live but unsited" in e for e in errors), errors


@skip
def test_questhooks_claiming_a_quest_that_does_not_anchor_here_fails(tmp_path: Path):
    """The claim runs both ways: a code on a record must name a quest that
    anchors on that record."""
    cat = _catalogue_copy(tmp_path)
    pid = "place.dunmer-north.nine-fords"

    def add(rec, claim):
        hooks = rec.setdefault("questHooks", {"provisions": [], "tags": [],
                                              "opportunity": "", "tierOwnership": ""})
        hooks["tierOwnership"] = "; ".join(filter(None, [hooks.get("tierOwnership"), claim]))

    _edit(cat, pid, lambda rec: add(rec, "ZZ99 · tier-3"))
    errors = Q.check(catalogue_dir=cat)
    assert any(f"questHooks on {pid} names ZZ99, which is not a quest" in e
               for e in errors), errors

    cat2 = _catalogue_copy(tmp_path / "second")
    other = "place.dunmer-north.tearmouth"
    _edit(cat2, other, lambda rec: add(rec, "LD95 · tier-3"))
    errors = Q.check(catalogue_dir=cat2)
    assert any(f"questHooks on {other} names LD95, which does not anchor here" in e
               for e in errors), errors
