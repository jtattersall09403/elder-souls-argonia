#!/usr/bin/env python3
"""Image-reader briefs for one agent walk (tooling/gpu-lane/walk/README.md).

    python3 tooling/gpu-lane/walk/walk_judge.py <walk report dir>

Reads <dir>/summary.json and the reader-checklist rows (by id, at run time,
from .claude/skills/place-build/references/reader-checklist.md) and writes
<dir>/judge/<group>-<k>.md: groups of at most 12 images, each brief naming the
report path its reader writes. Launching the readers is the caller's job.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CHECKLIST = REPO / ".claude/skills/place-build/references/reader-checklist.md"
MAX_IMAGES = 12
# reader-checklist row ids each group cites
ROWS = {
    "exterior-day": [12, 16, 19, 21, 25, 35, 38, 40, 41, 42, 46, 52],
    "exterior-night": [15, 24, 34, 47],
    "interiors": [47, 48, 49, 50],
    "fires-closeups": [12, 16, 25, 34, 41, 42, 52],
}
OPEN_QUESTION = "Does anything feel off for a Black Marsh settlement in our game (a swampy Imperial-Argonian frontier province)?"
EXIT_RULE = ("Return a ranked defect list, worst first, with evidence per shot: the file name, where in the frame "
             "(screen-left/right, near/far), and which row id. \"Nothing\" is a valid answer. Generic improvements are out of scope.")


def checklist_rows(path: Path = CHECKLIST) -> dict[int, str]:
    rows = {}
    for line in path.read_text().splitlines():
        m = re.match(r"^(\d+)\. (.*)$", line)
        if m:
            rows[int(m.group(1))] = m.group(2)
    return rows


def group_of(file: str) -> str:
    m = re.match(r"t(\d+)", file)
    night = bool(m) and not (7 <= int(m.group(1)) < 19)
    if "-int" in file:
        return "interiors"
    if re.search(r"-(fire\d+|sign\d+)|-base\.jpg", file):
        return "fires-closeups"
    return "exterior-night" if night else "exterior-day"


def interior_facts(summary: dict) -> list[str]:
    out = []
    for p in summary.get("passes", []):
        for w in p.get("waypoints", []):
            for a in w.get("actions", []):
                if a.get("type") == "door":
                    out.append(f"- {a['doorId']} -> {a.get('cellId')}: entered {a.get('entered')}, back out {a.get('exited')}"
                               f" (focus at the door: {a.get('focusBefore')}, exit focus: {a.get('exitFocus')})")
    return out


def briefs(report: Path) -> list[Path]:
    summary = json.loads((report / "summary.json").read_text())
    rows = checklist_rows()
    shots = sorted(p.name for p in report.glob("*.jpg"))
    groups: dict[str, list[str]] = {}
    for f in shots:
        groups.setdefault(group_of(f), []).append(f)
    out_dir = report / "judge"
    out_dir.mkdir(exist_ok=True)
    written = []
    for g in sorted(groups):
        files = groups[g]
        for k in range(0, len(files), MAX_IMAGES):
            chunk = files[k:k + MAX_IMAGES]
            name = f"{g}-{k // MAX_IMAGES + 1}"
            lines = [f"# Walk judge brief: {summary.get('placeId')} — {name}", "",
                     "You are reading screenshots an agent took walking this place in the studio, in character view.", "",
                     "## Images", *[f"- {report / f}" for f in chunk], "",
                     "## Rows (reader-checklist.md; answer each YES/NO/UNSURE per shot it applies to)",
                     *[f"- row {r}: {rows[r]}" for r in ROWS[g] if r in rows], ""]
            if g == "interiors":
                lines += ["## The run's door record (summary.json)", *interior_facts(summary), ""]
            lines += ["## Open question", OPEN_QUESTION, "", "## Exit rule", EXIT_RULE, "",
                      "## Write your answer to", str(out_dir / f"{name}.reader.md"), ""]
            p = out_dir / f"{name}.md"
            p.write_text("\n".join(lines))
            written.append(p)
    return written


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    for p in briefs(Path(sys.argv[1])):
        print(p)
