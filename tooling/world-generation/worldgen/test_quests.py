"""The quest data validates, and docs/quests/index/ is a fresh render of it."""

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
