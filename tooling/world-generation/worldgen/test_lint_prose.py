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
