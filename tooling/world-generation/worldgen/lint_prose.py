"""Mechanical prose lint — the AI-tell rules that a regex CAN catch.

    cd tooling/world-generation
    python3 -m worldgen.lint_prose                 # catalogue, report to stdout + sites/prose-lint.md
    python3 -m worldgen.lint_prose --strict        # exit 1 if any HARD rule fires (the npm-test gate)
    python3 -m worldgen.lint_prose --md docs/text/culture-registers.md docs/quests/index/*.md
    python3 -m worldgen.lint_prose --json out.json --region dunmer-north

WHY (owner, touchpoint ③ round 3, 2026-09-04)
--------------------------------------------
Two review passes by hand still let the same constructions through: the
comma-and join, "has never once", "the only / the one thing", "nobody ever",
the flat balanced and-pair ("...set the route each year and will not explain
it"), and *and* where the sense is *but*. Reviewers tire; a regex does not.
This module is the floor under the qualitative review in
docs/text/review-process.md §3 — it catches PHRASES and counts DENSITY; the
shape tests (read aloud, the Morrowind test, delete-the-last-clause) stay
with the reviewer. Rules and their rationale: docs/quests/60 §45e.1 and
docs/text/style-guide.md §2.4–2.6.

Two severities:
* HARD — zero tolerance; `--strict` fails on any hit and the pytest gate
  keeps the catalogue clean.
* SOFT — a candidate for the reviewer's eye, reported and counted (density
  per 1,000 words), never failed on. Some are hedged on purpose: the
  and-closer heuristic over-reports, and that is the point — the reviewer
  decides, the tool makes sure the reviewer looks.

The linter reads prose FIELDS of live catalogue records (the same set the
text-review brief names) and, with `--md`, the prose cells and paragraphs of
markdown files. It never edits anything.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from . import catalogue

REPORT_PATH = catalogue.REPO_ROOT / "world" / "sources" / "sites" / "prose-lint.md"

# Catalogue prose fields (the text-review brief's list, plus the v2 notes).
PROSE_PATHS = [
    ("why", "founding"), ("why", "siteAdvantages"), ("why", "occupantsMotive"),
    ("why", "pressures"), ("why", "wouldChangeIf"),
    ("vibe", "silhouette"), ("vibe", "palette"), ("vibe", "materials"),
    ("vibe", "signatureFeature"), ("vibe", "condition"), ("vibe", "mood"),
    ("vibe", "approach"), ("vibe", "senses"),
    ("playerPurpose", "hook"), ("questHooks", "opportunity"),
    ("sitingNote",),
]


@dataclass(frozen=True)
class Rule:
    id: str
    severity: str            # "hard" | "soft"
    pattern: re.Pattern
    why: str


def _r(p: str) -> re.Pattern:
    return re.compile(p, re.I)


RULES: list[Rule] = [
    # ---- HARD: the owner's named bans -------------------------------------
    Rule("comma-and", "hard", _r(r",\s+and\s+(?!(?:so|then|yet)\b)"),
         "comma + and joining clauses (60 §45e.1 last row); rephrase or split"),
    Rule("never-once", "hard", _r(r"\bnever once\b|\bnot once\b(?=[^.]*\b(?:discuss|mention|explain|ask|said|spoken|talk))"),
         "'has never once …' is an AI tell"),
    Rule("nobody-ever", "hard", _r(r"\b(?:nobody|no one|no-one|none of them) (?:ever|will (?:say|explain|discuss|tell|admit|name)|has ever)\b"),
         "'nobody ever / no one will say' closer"),
    Rule("everyone-nobody", "hard", _r(r"\beveryone knows\b[^.]*\b(?:and|but)\b[^.]*\b(?:nobody|no one)\b"),
         "'everyone knows X and nobody Y' antithesis closer"),
    Rule("the-one-thing", "hard", _r(r"\bthe one (?:thing|place|point|spot|man|woman|person|reason|time|way|question|fact|rule|road|door|room|name|stretch|piece|part)\b"),
         "'the one X (that …)' uniqueness flourish; put uniqueness in a fact field or cut"),
    Rule("the-very", "hard", _r(r"\bthe very (?!(?:least|most|top|bottom|end|edge|first|last|next|same|day|night|morning)\b)"),
         "'the very' padding"),
    Rule("it-is-said", "hard", _r(r"\bit is said\b|\bthey say that\b|\bsome say\b"),
         "unattributed lore opener"),
    Rule("self-gloss", "hard", _r(r",\s+which is (?:the point|the problem|the whole (?:point|story)|why it matters|the trouble)\b"),
         "writer explaining its own image"),
    Rule("not-x-but-y", "hard", _r(r"\bnot (?:just|only|merely|simply) [^.;]{1,60}\bbut\b|\bis not a [^.;,]{1,40}, (?:it is|it's|but) a\b"),
         "negative parallelism"),
    Rule("register-vocab", "hard", _r(r"\b(?:tapestry|testament to|nestled|timeless|intricate|interplay|underscore\b|pivotal|showcases?|meticulous(?:ly)?|foster(?:s|ed|ing)?|harness(?:es|ed|ing)?|navigat(?:e|es|ed|ing)|leverage|infrastructure|unioni[sz]ed|brute-forced|whispers of|echoes of)\b"),
         "AI register vocabulary / modern idiom"),
    Rule("ellipsis", "hard", _r(r"…|\.\.\."), "trailing ellipsis for mood"),
    Rule("canon-marker", "hard", _r(r"\bcanon(?:ically|-named)?\b|\bper the \w+ rule\b|\bthe player\b|\bthe game\b"),
         "provenance / design / session voice inside world prose"),
    Rule("feelings-formula", "hard", _r(r"\b(?:faintly|quietly|slightly|genuinely|oddly|strangely|vaguely) (?:\w+ing|\w+ed|\w+ful|\w+less|\w+ous|\w+ive|\w+al|\w+ish|\w+y)\b"),
         "hedged-adverb mood formula"),
    Rule("ask-anyone", "hard", _r(r"\bask (?:anyone|anybody|everyone|around)\b"),
         "'ask anyone' — name who (a role, a person, a house); owner 2026-09-04"),
    # ---- SOFT: density and candidates for the reviewer --------------------
    Rule("generaliser", "soft", _r(r"\b(?:anyone|anybody|everyone|everybody|nobody|no one|no-one|nothing|everything|anything|always|all of them|none of them|the only|the one|whole province|in the province)\b"),
         "lazy generalisation (owner 2026-09-04): tie it to the place — a role, a name, a number, a direction"),
    Rule("the-only", "soft", _r(r"\bthe only\b"),
         "'the only' — allowed rarely; >1 per record or >4 per 1,000 words is convergence"),
    Rule("never", "soft", _r(r"\bnever\b"),
         "'never' density (the negative-absolute tic)"),
    Rule("and-closer", "soft", _r(r"\b(?:[^.;:!?]{12,}?) and (?:(?:will|would|does|do|did|has|have|had|is|are|was|were|cannot|can|could|should|must|nobody|no one|everyone|the \w+ (?:has|have|will|are|is|do|does|did)) (?:not |never )?[^.;:!?]{2,60})[.!?]?$"),
         "flat balanced and-pair (clause + and + auxiliary-verb clause); ask the and/but test, or split"),
    Rule("and-for-but", "soft", _r(r"\band (?:still|yet|visibly|somehow|no one|nobody|nothing|none|never|not|only|nowhere|no longer|nothing)\b"),
         "'and' where the sense is probably 'but'"),
    Rule("colon-reveal", "soft", _r(r":\s+[a-z][^.:;]{0,25}[.!]$"), "colon doing a drum-roll"),
    Rule("question-answer", "soft", _r(r"\?\s+[A-Z][^.?!]{0,24}[.!]"), "rhetorical question answered in the next clause"),
    Rule("tricolon", "soft", _r(r"\bthe \w+, the \w+(?:,| and) the \w+\b|\b\w+, \w+ and \w+\b(?=[^,]*$)"),
         "possible tricolon; three-beat lists read as machine cadence"),
    Rule("em-dash", "soft", _r(r"—"), "em-dash count (two stock phrases welded)"),
    Rule("ancient", "soft", _r(r"\bancient\b"), "scene-setting default"),
    Rule("will-not-say", "soft", _r(r"\bwill not (?:say|explain|discuss|tell|name|admit)\b|\bdoes not (?:explain|discuss)\b|\bhas (?:never|not) (?:been )?(?:discussed|explained|mentioned)\b"),
         "'will not say / has not been discussed' — the withheld-secret beat; fine once, a tic at scale"),
]

RECORD_RULES = [
    Rule("generaliser-heavy", "hard", re.compile(r"(?!)"), f"more than {2} everyone/nobody/nothing/the-only beats in one record"),
    Rule("hook-copies-site", "hard", re.compile(r"(?!)"), "hook is a verbatim copy of why.siteAdvantages (60 §45e.1 echo row)"),
    Rule("the-only-repeat", "hard", re.compile(r"(?!)"), "'the only' more than once in one record (style guide §2.6 cap)"),
]
HARD = [r for r in RULES if r.severity == "hard"] + RECORD_RULES
SOFT = [r for r in RULES if r.severity == "soft"]
# Density thresholds per 1,000 words for the soft rules that are tics at scale.
SOFT_DENSITY_MAX = {"the-only": 1.5, "never": 3.0, "and-closer": 6.0, "will-not-say": 2.0, "ancient": 2.0,
                    "generaliser": 5.0}
# Per-record cap for the generaliser class (a record with three "everyone /
# nobody / the only" beats is the tell whatever the province average says).
GENERALISER_RECORD_MAX = 2
# Province-wide ceilings (owner 2026-09-04: overuse is a body-of-text problem,
# not a per-record one). Checked over the whole run, all scopes together.
GLOBAL_DENSITY_MAX = {"generaliser": 4.0, "the-only": 0.8, "never": 2.5}
# Design-voice fields: not player-visible, so the provenance/session-voice rule does not apply.
DESIGN_FIELDS = {"questHooks.opportunity"}
DESIGN_EXEMPT_RULES = {"canon-marker"}


@dataclass
class Hit:
    where: str        # record id or file:line
    fld: str
    rule: str
    severity: str
    excerpt: str


@dataclass
class LintResult:
    hits: list[Hit] = field(default_factory=list)
    words: int = 0
    texts: int = 0
    # per-record hard counts for the strict gate; per-region soft counts for density
    by_scope_words: Counter = field(default_factory=Counter)
    by_scope_rule: dict = field(default_factory=lambda: defaultdict(Counter))

    def add_text(self, scope: str, where: str, fld: str, text: str) -> None:
        if not text or not isinstance(text, str):
            return
        self.texts += 1
        n = len(text.split())
        self.words += n
        self.by_scope_words[scope] += n
        for rule in RULES:
            if fld in DESIGN_FIELDS and rule.id in DESIGN_EXEMPT_RULES:
                continue
            for m in rule.pattern.finditer(text):
                s = max(0, m.start() - 30)
                e = min(len(text), m.end() + 30)
                self.hits.append(Hit(where, fld, rule.id, rule.severity, text[s:e].replace("\n", " ")))
                self.by_scope_rule[scope][rule.id] += 1

    def hard_hits(self) -> list[Hit]:
        return [h for h in self.hits if h.severity == "hard"]

    def density(self, scope: str, rule: str) -> float:
        w = self.by_scope_words.get(scope, 0)
        return (self.by_scope_rule[scope][rule] / w * 1000.0) if w else 0.0

    def global_density(self, rule: str) -> float:
        n = sum(c[rule] for c in self.by_scope_rule.values())
        return (n / self.words * 1000.0) if self.words else 0.0

    def density_failures(self) -> list[tuple[str, str, float]]:
        out = []
        for scope in sorted(self.by_scope_words):
            for rule, mx in SOFT_DENSITY_MAX.items():
                d = self.density(scope, rule)
                if d > mx:
                    out.append((scope, rule, round(d, 1)))
        for rule, mx in GLOBAL_DENSITY_MAX.items():
            d = self.global_density(rule)
            if d > mx:
                out.append(("WHOLE RUN", rule, round(d, 1)))
        return out


def _get(rec: dict, path: tuple) -> str | None:
    cur = rec
    for k in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur if isinstance(cur, str) else None


def lint_record(res: LintResult, rec: dict, scope: str) -> None:
    rid = rec["id"]
    # Record-level checks the wave-2 reviewers asked for (2026-09-04): a hook
    # that copies siteAdvantages (64 of 140 in one region), and "the only"
    # used more than once in one record (the per-record cap in the style guide).
    hook = ((rec.get("playerPurpose") or {}).get("hook") or "").strip().lower()
    adv = ((rec.get("why") or {}).get("siteAdvantages") or "").strip().lower()
    if hook and adv and hook == adv:
        res.hits.append(Hit(rid, "playerPurpose.hook", "hook-copies-site", "hard", hook[:70]))
        res.by_scope_rule[scope]["hook-copies-site"] += 1
    only = 0
    gen = 0
    gen_pat = next(r.pattern for r in RULES if r.id == "generaliser")
    for path in PROSE_PATHS:
        t = _get(rec, path)
        if t:
            only += len(re.findall(r"\bthe only\b", t, re.I))
            gen += len(gen_pat.findall(t))
    if gen > GENERALISER_RECORD_MAX:
        res.hits.append(Hit(rid, "record", "generaliser-heavy", "hard", f"{gen} generalisers in one record (max {GENERALISER_RECORD_MAX})"))
        res.by_scope_rule[scope]["generaliser-heavy"] += 1
    if only > 1:
        res.hits.append(Hit(rid, "record", "the-only-repeat", "hard", f"'the only' {only}× in one record"))
        res.by_scope_rule[scope]["the-only-repeat"] += 1
    for path in PROSE_PATHS:
        t = _get(rec, path)
        if t:
            res.add_text(scope, rid, ".".join(path), t)
    for i, o in enumerate(rec.get("occupants") or []):
        if isinstance(o, str):
            res.add_text(scope, rid, f"occupants[{i}]", o)
    c = rec.get("contents") or {}
    for kind in ("creatures", "npcs", "loot"):
        for i, slot in enumerate(c.get(kind) or []):
            if isinstance(slot, dict):
                for k in ("note", "provenance"):
                    if isinstance(slot.get(k), str):
                        res.add_text(scope, rid, f"contents.{kind}[{i}].{k}", slot[k])
    for i, v in enumerate(rec.get("localStateVariants") or []):
        if isinstance(v, dict):
            for k in ("when", "whatChanges"):
                if isinstance(v.get(k), str):
                    res.add_text(scope, rid, f"localStateVariants[{i}].{k}", v[k])
    for i, f in enumerate((rec.get("hostility") or {}).get("flips") or []):
        if isinstance(f, dict) and isinstance(f.get("note"), str):
            res.add_text(scope, rid, f"hostility.flips[{i}].note", f["note"])


def lint_catalogue(regions: set[str] | None = None) -> LintResult:
    res = LintResult()
    for rf in catalogue.load_region_files():
        if regions and rf.region not in regions:
            continue
        for rec in rf.places:
            if rec.get("status") in {"cut", "deferred"}:
                continue
            lint_record(res, rec, rf.region)
    return res


QUESTS_DIR = catalogue.REPO_ROOT / "world" / "sources" / "quests"
TEXT_CATALOGUE = catalogue.REPO_ROOT / "packages" / "text-catalogue" / "src" / "entries.ts"


def lint_quests(res: LintResult) -> None:
    """Every quest row's title and premise (world/sources/quests/*.json) — the
    owner's 'same across our quest index text' (2026-09-04)."""
    for p in sorted(QUESTS_DIR.glob("*.json")):
        if p.name == "lines.json":
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        for q in data.get("quests") or []:
            if q.get("status") == "cut":
                continue
            scope = f"quests/{p.stem}"
            for fld in ("title", "premise"):
                if isinstance(q.get(fld), str):
                    res.add_text(scope, q.get("id") or q.get("code"), fld, q[fld])


def lint_text_catalogue(res: LintResult) -> None:
    """Player-visible strings in packages/text-catalogue (the `text:` values)."""
    if not TEXT_CATALOGUE.exists():
        return
    src = TEXT_CATALOGUE.read_text(encoding="utf-8")
    for m in re.finditer(r'id:\s*"([^"]+)"[\s\S]*?text:\s*"((?:[^"\\]|\\.)*)"', src):
        res.add_text("text-catalogue", m.group(1), "text", m.group(2).replace('\\"', '"'))


_MD_SKIP = re.compile(r"^\s*(?:#|\||>|```|-\s*\[|\d+\.\s)|^\s*$")


def lint_markdown(res: LintResult, path: Path, table_cells: bool = True) -> None:
    """Prose paragraphs and (optionally) table cells of a markdown file.
    Headings, links-only lines and code fences are skipped; code spans and
    links are stripped so ids and paths never trip the vocabulary rules."""
    scope = str(path.relative_to(catalogue.REPO_ROOT)) if path.is_absolute() else str(path)
    in_code = False
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        clean = re.sub(r"`[^`]*`", "", line)
        clean = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", clean)
        if line.lstrip().startswith("|"):
            if not table_cells or re.match(r"^\s*\|\s*-", line):
                continue
            for i, cell in enumerate(clean.strip().strip("|").split("|")):
                cell = cell.strip()
                if len(cell.split()) >= 4:
                    res.add_text(scope, f"{scope}:{n}", f"cell{i}", cell)
            continue
        if _MD_SKIP.match(line) and not line.lstrip().startswith("-"):
            continue
        text = clean.lstrip("-* ").strip()
        if len(text.split()) >= 4:
            res.add_text(scope, f"{scope}:{n}", "para", text)


def render_report(res: LintResult, title: str) -> str:
    hard = res.hard_hits()
    lines = [f"# Prose lint — {title}", "",
             "<!-- GENERATED by `python3 -m worldgen.lint_prose`. Do not hand-edit. -->", "",
             f"{res.texts} texts · {res.words:,} words · **{len(hard)} hard hits** · "
             f"{len(res.hits) - len(hard)} soft candidates. Rules: docs/quests/60 §45e.1, docs/text/style-guide.md §2.4–2.6.", ""]
    lines += ["## Hard rules (must be zero)", "", "| rule | hits | why |", "|---|---:|---|"]
    hc = Counter(h.rule for h in hard)
    for r in HARD:
        lines.append(f"| `{r.id}` | {hc.get(r.id, 0)} | {r.why} |")
    lines += ["", "## Soft rules — density per 1,000 words, by scope", ""]
    scopes = sorted(res.by_scope_words)
    lines.append("| scope | words | " + " | ".join(f"`{r.id}`" for r in SOFT) + " |")
    lines.append("|---|---:|" + "---:|" * len(SOFT))
    for s in scopes:
        cells = []
        for r in SOFT:
            d = res.density(s, r.id)
            mx = SOFT_DENSITY_MAX.get(r.id)
            cells.append(f"**{d:.1f}**" if mx and d > mx else f"{d:.1f}")
        lines.append(f"| {s} | {res.by_scope_words[s]:,} | " + " | ".join(cells) + " |")
    lines += ["", "Whole run: " + ", ".join(f"`{r}` {res.global_density(r):.2f}/1k (max {mx})" for r, mx in GLOBAL_DENSITY_MAX.items())]
    fails = res.density_failures()
    if fails:
        lines += ["", "Density over the ceiling (bold above): " + "; ".join(f"{s} `{r}` {d}" for s, r, d in fails)]
    lines += ["", "## Hard hits", ""]
    for h in hard[:2000]:
        lines.append(f"- `{h.where}` · {h.fld} · **{h.rule}** — …{h.excerpt}…")
    if len(hard) > 2000:
        lines.append(f"- … {len(hard) - 2000} more")
    lines += ["", "## Soft candidates (for the reviewer's eye)", ""]
    soft = [h for h in res.hits if h.severity == "soft" and h.rule in ("and-closer", "and-for-but", "the-only", "will-not-say")]
    for h in soft[:1500]:
        lines.append(f"- `{h.where}` · {h.fld} · {h.rule} — …{h.excerpt}…")
    if len(soft) > 1500:
        lines.append(f"- … {len(soft) - 1500} more")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--region", action="append", help="limit to a region (repeatable)")
    ap.add_argument("--md", nargs="*", default=[], help="markdown files to lint as well (globs ok)")
    ap.add_argument("--no-catalogue", action="store_true", help="skip the place catalogue")
    ap.add_argument("--quests", action="store_true", help="lint the quest data rows (title/premise) — included automatically in a whole-catalogue run")
    ap.add_argument("--strict", action="store_true", help="exit 1 on any hard hit or density ceiling breach")
    ap.add_argument("--json", type=Path, help="write hits as JSON here")
    ap.add_argument("--report", type=Path, default=None, help="markdown report path ('-' for none; default: the shared report for a whole-catalogue run, none for --region runs so concurrent reviewers do not overwrite it)")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    if a.report is None:
        a.report = Path("-") if (a.region or a.no_catalogue) else REPORT_PATH

    res = LintResult() if a.no_catalogue else lint_catalogue(set(a.region) if a.region else None)
    if not a.region and not a.no_catalogue:
        # a whole-catalogue run is the body-of-text run: quest rows and the
        # text catalogue count toward the same province-wide ceilings
        lint_quests(res)
        lint_text_catalogue(res)
    if a.quests:
        lint_quests(res)
    md_paths: list[Path] = []
    for pat in a.md:
        p = Path(pat)
        md_paths += sorted(catalogue.REPO_ROOT.glob(pat)) if not p.is_absolute() and any(ch in pat for ch in "*?[") else [p]
    for p in md_paths:
        lint_markdown(res, p if p.is_absolute() else catalogue.REPO_ROOT / p)

    title = "place catalogue" + (f" ({', '.join(a.region)})" if a.region else "")
    if md_paths:
        title += " + " + ", ".join(str(p) for p in md_paths)
    report = render_report(res, title)
    if str(a.report) != "-":
        a.report.parent.mkdir(parents=True, exist_ok=True)
        a.report.write_text(report, encoding="utf-8")
    if a.json:
        a.json.write_text(json.dumps([h.__dict__ for h in res.hits], indent=1, ensure_ascii=False), encoding="utf-8")
    hard = res.hard_hits()
    fails = res.density_failures()
    if not a.quiet:
        hc = Counter(h.rule for h in hard)
        print(f"{res.texts} texts, {res.words:,} words: {len(hard)} hard hits "
              + (f"({', '.join(f'{k} {v}' for k, v in hc.most_common())})" if hc else "")
              + f"; {len(res.hits) - len(hard)} soft candidates; density breaches: {len(fails)}")
        for s, r, d in fails:
            print(f"  density {s} {r} = {d}/1k words (max {SOFT_DENSITY_MAX[r]})")
        if str(a.report) != "-":
            print(f"report: {a.report}")
    if a.strict and (hard or fails):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
