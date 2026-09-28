"""Decision 0105 R39 (method review r5 finding C: orient cost 12-17 min per
place reading three briefs, 0105 and a skill that grew 111 lines in a day):
the place-build skill stays at most 450 lines, and the walk-3 rulings live
as one line each in its rulings table, which covers every ruling 0105
numbers, in order, with no gap."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILL = ROOT / ".claude" / "skills" / "place-build" / "SKILL.md"
RULINGS = SKILL.parent / "references" / "rulings.md"
DECISION = next((ROOT / "docs" / "decisions").glob("0105-*.md"))
SKILL_MAX_LINES = 450


def table_rules(text: str) -> list[int]:
    return [int(m) for m in re.findall(r"^\| R(\d+) \|", text, flags=re.M)]


def decision_rules(text: str) -> set[int]:
    return {int(m) for m in re.findall(r"\*\*R(\d+)\b", text)}


def test_the_skill_is_lean():
    n = len(SKILL.read_text().splitlines())
    assert n <= SKILL_MAX_LINES, f"{SKILL.relative_to(ROOT)} is {n} lines > {SKILL_MAX_LINES} (0105 R39)"


def test_the_rulings_table_has_every_ruling_once_in_order():
    rules = table_rules(RULINGS.read_text())
    assert rules == list(range(1, len(rules) + 1)), "rulings.md: R1..Rn, one row each, in order"
    missing = decision_rules(DECISION.read_text()) - set(rules)
    assert not missing, f"0105 rulings with no rulings.md row: {sorted(missing)}"


def test_the_checks_fail_on_purpose():
    assert table_rules("| R1 | a |\n| R3 | b |\n") != [1, 2]
    assert decision_rules("**R41 New.** text") == {41}
