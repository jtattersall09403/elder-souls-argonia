"""Prose-lint gate: `packages/text-catalogue` and `world/sources` — every
string a player can read in the game or in any of our apps, the studio's review
panels included (owner 2026-09-21) — carries no hard AI-tell hits, and no prose
data lives outside those roots. `docs/**` is not linted."""
from pathlib import Path

from . import lint_prose


def test_the_gate_is_green_on_the_tree():
    res = lint_prose.LintResult()
    lint_prose.lint_roots(res)
    hard = res.hard_hits()
    assert not hard, [f"{h.where} {h.fld}: {h.rule} …{h.excerpt}…" for h in hard[:12]]
    # The floor is the world-record walk: ~20,000 texts on the tree today, so
    # a walk that silently stopped reaching the records would fail here.
    assert res.texts > 15000, res.texts      # it cannot pass by linting nothing


def test_the_catalogue_and_the_world_records_are_walked():
    assert sorted(str(r) for r in lint_prose.LINT_ROOTS) == [
        "packages/text-catalogue", "world/sources"]


def test_a_generated_catalogue_file_is_linted():
    """The generators lift world records into src/generated/*.ts; those strings
    ARE player-visible, so the walk must reach them."""
    res = lint_prose.LintResult()
    lint_prose.lint_source_file(
        res, lint_prose.catalogue.REPO_ROOT / "packages/text-catalogue/src/generated/hydrology-names.ts",
        "generated")
    assert res.texts > 50, res.texts


def test_a_new_entry_in_entries_ts_is_linted_without_being_listed(tmp_path):
    """No field list: a key nobody has seen before still reaches the rules."""
    f = tmp_path / "entries.ts"
    f.write_text('  { id: "text.new", text: "The gate stood open, and the wardens said nothing." },\n',
                 encoding="utf-8")
    res = lint_prose.LintResult()
    lint_prose.lint_source_file(res, f, "entries.ts")
    assert "comma-and" in {h.rule for h in res.hard_hits()}


def test_rules_catch_owner_examples():
    res = lint_prose.LintResult()
    res.add_text("t", "r", "why.pressures", "This is the answer, and Blackrose has never once discussed it.")
    res.add_text("t", "r", "why.founding", "The one stretch of road wide enough for a gate.")
    res.add_text("t", "r", "vibe.mood", "The list closed at dusk, and the list is the list.")
    rules = {h.rule for h in res.hard_hits()}
    assert {"comma-and", "never-once", "the-one-thing"} <= rules
    soft = {h.rule for h in res.hits if h.severity == "soft"}
    res2 = lint_prose.LintResult()
    res2.add_text("t", "r", "why.pressures", "Trial-keepers set the route each year and will not explain it.")
    assert "and-closer" in {h.rule for h in res2.hits} or "will-not-say" in {h.rule for h in res2.hits}
    assert soft is not None


def test_markdown_is_linted_by_paragraph_not_by_line(tmp_path):
    """Audit §6.6 — markdown is hard-wrapped, so a line-at-a-time lint read
    every wrap as a sentence ending on a preposition."""
    doc = tmp_path / "note.md"
    doc.write_text(
        "The haul road climbs the shelf from\n"
        "the mouth of the cut, and the gate stands across it.\n",
        encoding="utf-8")
    res = lint_prose.LintResult()
    lint_prose.lint_markdown(res, doc)
    assert not any(h.rule == "final-preposition" for h in res.hard_hits())


def test_a_code_span_does_not_end_a_sentence_on_a_preposition(tmp_path):
    doc = tmp_path / "note.md"
    doc.write_text("The terrace track runs from `route.mazzatun.haul`.\n", encoding="utf-8")
    res = lint_prose.LintResult()
    lint_prose.lint_markdown(res, doc)
    assert not any(h.rule == "final-preposition" for h in res.hard_hits())


def test_blockquoted_prose_is_linted(tmp_path):
    """Defect 2026-09-08: `> ` lines were skipped, so prose inside a quote
    never reached the gate."""
    doc = tmp_path / "brief.md"
    doc.write_text(
        "> The village is nestled under the scarp, and it is a testament to the\n"
        "> masons who cut it.\n",
        encoding="utf-8")
    res = lint_prose.LintResult()
    lint_prose.lint_markdown(res, doc)
    rules = {h.rule for h in res.hard_hits()}
    assert {"register-vocab", "comma-and"} <= rules, rules


def test_attributed_quoted_source_material_is_exempt(tmp_path):
    """Exempt by what it is (someone else's words, attributed), not by '>'."""
    doc = tmp_path / "brief.md"
    doc.write_text(
        "> UESP: the city is nestled in the marsh, and it is a testament to the Hist.\n",
        encoding="utf-8")
    res = lint_prose.LintResult()
    lint_prose.lint_markdown(res, doc)
    assert not res.hard_hits(), [h.rule for h in res.hard_hits()]


def test_a_real_final_preposition_is_still_caught(tmp_path):
    doc = tmp_path / "note.md"
    doc.write_text("The northern water approach is the one they asked for.\n", encoding="utf-8")
    res = lint_prose.LintResult()
    lint_prose.lint_markdown(res, doc)
    assert any(h.rule == "final-preposition" for h in res.hard_hits())


_HARD_SENTENCE = ("The village is nestled under the scarp, and it is a "
                  "testament to the masons.\n")


# --- lint by exclusion (owner 2026-09-21) ----------------------------------

def test_a_new_field_name_is_linted_without_being_listed():
    """A record type nobody has seen before, with a field name that is in no
    inclusion list, still reaches the rules."""
    rec = {"id": "book.new", "bookText": "The gate stood open, and the wardens said nothing of it."}
    found = dict(lint_prose.iter_prose_strings(rec))
    assert "/bookText" in found
    res = lint_prose.LintResult()
    for ptr, text in found.items():
        res.add_text("s", "book.new", ptr, text)
    assert "comma-and" in {h.rule for h in res.hard_hits()}


def test_an_exempt_key_is_not_linted():
    rec = {"sourcePath": "world/sources/x.json, and the loader reads it first.",
           "assemblyId": "a, and b, and c are joined here as one id."}
    assert dict(lint_prose.iter_prose_strings(rec)) == {}


def test_short_and_unpunctuated_values_are_not_prose():
    assert not lint_prose.looks_like_prose("marsh bank")
    assert lint_prose.looks_like_prose("A bank of marsh reed above the tide")
    assert lint_prose.looks_like_prose("Open at dawn.")


def test_tripwire_fires_on_prose_data_under_packages(tmp_path, monkeypatch):
    pkg = tmp_path / "packages" / "demo"
    pkg.mkdir(parents=True)
    (pkg / "strings.json").write_text(
        '{"greeting": "The warden opens the gate at dawn and closes it again '
        'before the tide turns."}', encoding="utf-8")
    monkeypatch.setattr(lint_prose.catalogue, "REPO_ROOT", tmp_path)
    hits = lint_prose.tripwire_hits()
    assert [h[0] for h in hits] == ["packages/demo/strings.json"]


def test_tripwire_is_green_on_the_tree():
    assert lint_prose.tripwire_hits() == []


def test_an_unlisted_field_in_a_places_file_is_linted(tmp_path, monkeypatch):
    """A places-*.json record grows a field no inclusion list names: it is
    linted anyway, because the walk lints by exclusion."""
    d = tmp_path / "world" / "sources" / "catalogue"
    d.mkdir(parents=True)
    (d / "places-test.json").write_text(
        '{"places": [{"id": "place.test", "freshlyInventedField":'
        ' "The wardens closed the gate, and the tide took the punts."}]}',
        encoding="utf-8")
    monkeypatch.setattr(lint_prose.catalogue, "REPO_ROOT", tmp_path)
    res = lint_prose.LintResult()
    lint_prose.lint_roots(res)
    assert "comma-and" in {h.rule for h in res.hard_hits()}


def test_a_lore_file_is_not_linted(tmp_path, monkeypatch):
    """world/sources/lore is sourced canon and agent notes: exempt with reason."""
    d = tmp_path / "world" / "sources" / "lore"
    d.mkdir(parents=True)
    (d / "dossier.json").write_text(
        '{"note": "The city is nestled in the marsh, and it is a testament to the Hist."}',
        encoding="utf-8")
    monkeypatch.setattr(lint_prose.catalogue, "REPO_ROOT", tmp_path)
    res = lint_prose.LintResult()
    skipped = lint_prose.lint_roots(res)
    assert not res.hard_hits()
    assert any("lore" in s_ for s_ in skipped), skipped


def test_an_exempt_machine_dir_is_not_linted(tmp_path, monkeypatch):
    """Mined plugin data under world/sources/placement is not our words."""
    d = tmp_path / "world" / "sources" / "placement"
    d.mkdir(parents=True)
    (d / "mined.json").write_text(
        '{"desc": "The hall is nestled beside the dock, and it is a testament to nothing."}',
        encoding="utf-8")
    monkeypatch.setattr(lint_prose.catalogue, "REPO_ROOT", tmp_path)
    res = lint_prose.LintResult()
    skipped = lint_prose.lint_roots(res)
    assert not res.hard_hits()
    assert any("placement" in s_ for s_ in skipped), skipped


def test_file_flag_fails_on_a_hit_and_passes_on_clean_text(tmp_path, monkeypatch):
    """--file is the post-edit hook's entry point: 1 on a hit, 0 when clean."""
    d = tmp_path / "world" / "sources" / "catalogue"
    d.mkdir(parents=True)
    dirty = d / "places-dirty.json"
    dirty.write_text('{"why": {"founding": "It is said the wardens built it here."}}',
                     encoding="utf-8")
    clean = d / "places-clean.json"
    clean.write_text('{"why": {"founding": "The wardens built the gate above the tide line."}}',
                     encoding="utf-8")
    monkeypatch.setattr(lint_prose.catalogue, "REPO_ROOT", tmp_path)
    assert lint_prose.main(["--file", str(dirty)]) == 1
    assert lint_prose.main(["--file", str(clean)]) == 0


def test_not_x_but_y_catches_the_bare_form():
    """The rule missed 'not a X but the Y' (mazzatun.md:66, 2026-09-21)."""
    res = lint_prose.LintResult()
    res.add_text("t", "r", "note",
                 "The Redoran gate is not a compromise but the reading that "
                 "the record already carries.")
    assert "not-x-but-y" in {h.rule for h in res.hard_hits()}
