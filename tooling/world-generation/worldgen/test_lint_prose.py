"""Prose-lint gate: the catalogue carries no hard AI-tell hits (owner rule
2026-09-04). The soft density ceilings are reported, never failed here."""
from collections import Counter

from . import lint_prose


def test_catalogue_has_no_hard_prose_hits():
    res = lint_prose.lint_catalogue()
    hard = res.hard_hits()
    counts = Counter(h.rule for h in hard)
    sample = [f"{h.where} {h.fld}: …{h.excerpt}…" for h in hard[:12]]
    assert not hard, f"{len(hard)} hard prose hits {dict(counts)}; first: {sample}"


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


def test_route_structure_prose_surface_cannot_be_empty():
    """Defect 2026-09-08: the authored route-structure sentences ship inside
    route-structures.json and were outside --strict."""
    res = lint_prose.LintResult()
    lint_prose.lint_route_structures(res)
    assert res.texts >= 30, res.texts
    assert res.by_scope_words["route-structures"] > 500


def test_a_real_final_preposition_is_still_caught(tmp_path):
    doc = tmp_path / "note.md"
    doc.write_text("The northern water approach is the one they asked for.\n", encoding="utf-8")
    res = lint_prose.LintResult()
    lint_prose.lint_markdown(res, doc)
    assert any(h.rule == "final-preposition" for h in res.hard_hits())


_HARD_SENTENCE = ("The village is nestled under the scarp, and it is a "
                  "testament to the masons.\n")


def _docs_tree(tmp_path, monkeypatch):
    monkeypatch.setattr(lint_prose.catalogue, "REPO_ROOT", tmp_path)
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "a.md").write_text(_HARD_SENTENCE, encoding="utf-8")


def test_docs_gate_fails_when_a_file_gets_worse(tmp_path, monkeypatch):
    """The ratchet: a docs/ file with hits the baseline does not allow fails."""
    _docs_tree(tmp_path, monkeypatch)
    baseline = tmp_path / "baseline.json"
    baseline.write_text('{"schemaVersion": 1, "rule": "r", "files": {}}', encoding="utf-8")
    rc, msgs = lint_prose.docs_gate(baseline)
    assert rc == 1, msgs
    assert any("docs/a.md" in m for m in msgs), msgs


def test_docs_gate_passes_at_baseline_and_notes_improvement(tmp_path, monkeypatch):
    _docs_tree(tmp_path, monkeypatch)
    baseline = tmp_path / "baseline.json"
    # count the file's real hits, then hold the bar exactly there
    lint_prose.docs_gate(baseline, write=True)
    import json
    n = json.loads(baseline.read_text())["files"]["docs/a.md"]
    assert n >= 2, n
    assert lint_prose.docs_gate(baseline) == (0, [])
    baseline.write_text(json.dumps({"schemaVersion": 1, "rule": "r",
                                    "files": {"docs/a.md": n + 1}}), encoding="utf-8")
    rc, msgs = lint_prose.docs_gate(baseline)
    assert rc == 0
    assert any("improved" in m for m in msgs), msgs
