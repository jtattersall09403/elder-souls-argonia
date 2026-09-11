"""Mechanical prose lint — the AI-tell rules that a regex CAN catch.

    cd tooling/world-generation
    python3 -m worldgen.lint_prose                 # catalogue, report to stdout + sites/prose-lint.md
    python3 -m worldgen.lint_prose --strict        # exit 1 if any HARD rule fires (the npm-test gate)
    python3 -m worldgen.lint_prose --md docs/standards/text/culture-registers.md docs/quests/index/*.md
    python3 -m worldgen.lint_prose --json out.json --region dunmer-north

WHY (owner, touchpoint ③ round 3, 2026-09-04)
--------------------------------------------
Two review passes by hand still let the same constructions through: the
comma-and join, "has never once", "the only / the one thing", "nobody ever",
the flat balanced and-pair ("...set the route each year and will not explain
it"), and *and* where the sense is *but*. Reviewers tire; a regex does not.
This module is the floor under the qualitative review in
docs/standards/text/review-process.md §3 — it catches PHRASES and counts DENSITY; the
shape tests (read aloud, the Morrowind test, delete-the-last-clause) stay
with the reviewer. Rules and their rationale: docs/quests/60 §45e.1 and
docs/standards/text/style-guide.md §2.4–2.6.

Round 5 (owner 2026-09-04, style guide §2.8 "trying too hard"): hard rules
for *exactly N*, *only one*, the turn-on-the-reader tag and a sentence or
clause ending on a preposition; soft counts for *none of it*, the short
tag-line closer and the repeated noun. The class itself (a sentence doing
more than stating its fact) is the reviewer's, via the `text-review` skill.

Two severities:
* HARD — zero tolerance; `--strict` fails on any hit and the pytest gate
  keeps the catalogue clean.
* SOFT — a candidate for the reviewer's eye, reported and counted (density
  per 1,000 words), never failed on. Some are hedged on purpose: the
  and-closer heuristic over-reports, and that is the point — the reviewer
  decides, the tool makes sure the reviewer looks.

The linter reads prose FIELDS of live catalogue records, the quest rows, the
text catalogue and the settlement blueprints (causal model, orientation
reasons, why blocks, notes and the typed player-purpose notes) — the same set
the text-review brief names — and, with `--md`, the prose cells and paragraphs
of markdown files. It never edits anything.
"""

from __future__ import annotations

import argparse
import ast
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


def iter_catalogue_prose(rec: dict):
    """Yield the catalogue prose surface shared by style and reference lint."""
    for path in PROSE_PATHS:
        text = _get(rec, path)
        if text:
            yield ".".join(path), text
    for i, occupant in enumerate(rec.get("occupants") or []):
        if isinstance(occupant, str):
            yield f"occupants[{i}]", occupant
    contents = rec.get("contents") or {}
    for kind in ("creatures", "npcs", "loot"):
        for i, slot in enumerate(contents.get(kind) or []):
            if not isinstance(slot, dict):
                continue
            for key in ("note", "provenance"):
                if isinstance(slot.get(key), str):
                    yield f"contents.{kind}[{i}].{key}", slot[key]
    for i, variant in enumerate(rec.get("localStateVariants") or []):
        if isinstance(variant, dict):
            for key in ("when", "whatChanges"):
                if isinstance(variant.get(key), str):
                    yield f"localStateVariants[{i}].{key}", variant[key]
    for i, flip in enumerate((rec.get("hostility") or {}).get("flips") or []):
        if isinstance(flip, dict) and isinstance(flip.get("note"), str):
            yield f"hostility.flips[{i}].note", flip["note"]


@dataclass(frozen=True)
class Rule:
    id: str
    severity: str            # "hard" | "soft"
    pattern: re.Pattern
    why: str
    fields: tuple = ()       # empty = every prose field; else only these field names


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
    Rule("exactly-n", "hard", _r(r"\bexactly (?:one|two|three|four|five|six|seven|eight|nine|ten|once|twice|\d+)\b"),
         "'exactly N' — precision as emphasis; state the number plainly or drop it (owner 2026-09-04; style guide §2.8)"),
    Rule("only-one", "hard", _r(r"\bonly (?:one|once)\b(?! (?:of|in|or) )|\bone and only\b|\bnot one of\b"),
         "'only one' — uniqueness as emphasis; 'this one', or the plain fact (owner 2026-09-04)"),
    Rule("final-preposition", "hard", _r(r"(?<![-\w])(?:through|with|for|of|to|at|from|by|about|under|into|onto|against|between|behind|beside|without|within|near|around|across|along|until|upon|towards?|among|amongst|in|on)(?=[.,;:!?](?:\s|$|\"|')|\s*$)"),
         "sentence or clause ends on a preposition — house grammar rule, all surfaces (owner 2026-09-04)"),
    Rule("second-person", "hard", _r(r"\b(?:you|your|yours|yourself)\b"),
         "place records are reference register: no address to the reader (style guide §2.8); recast in the third person",
         fields=tuple(".".join(p) for p in PROSE_PATHS)),
    Rule("turn-on-reader", "hard", _r(r"\bSo (?:is|are|was|were|do|does|did|will|can|would|have|has) (?:you|the player|anyone|whoever)\b|\byou will be next\b"),
         "the tag-line turn on the reader ('So are you.'); style guide §2.8 rule 2"),
    # ---- SOFT: density and candidates for the reviewer --------------------
    Rule("generaliser", "soft", _r(r"\b(?:anyone|anybody|everyone|everybody|nobody|no one|no-one|nothing|everything|anything|always|all of them|none of them|the only|the one|whole province|in the province)\b"),
         "lazy generalisation (owner 2026-09-04): tie it to the place — a role, a name, a number, a direction"),
    Rule("none-of", "soft", _r(r"\bnone of (?:it|them|which|this|that|these|those|us)\b|\bnone (?:is|are|was|were|has|have|do|does|did|will)\b"),
         "'none of it / none of them' — the absolute-negative tag; usually deletable (owner 2026-09-04)"),
    Rule("zinger-tail", "soft", _r(r"[.!?]\s+(?:[A-Z][^.!?]{0,17})[.!?]$"),
         "a record ending on a sentence of a few words after a longer one — the tag-line closer; end on a fact (style guide §2.8 rule 3)"),
    Rule("design-voice", "soft", _r(r"\bis a quest\b|\ba quest and a\b|\b(?:the|every|each|first|last) beat\b|\bthe pattern is the point\b|\bplayer-facing\b|\bthe opening'?s\b|\bwhich is (?:a|an) (?:delve|oddity|quest|fight|heist|whodunit|escort|fetch|dungeon|evidence)\b|\bworth a (?:whole )?quest\b|\bso a quest can\b"),
         "design or session voice inside a premise / opportunity / prose field (round-5 reviewers, 2026-09-04)"),
    Rule("wry-label", "soft", _r(r"^[A-Za-z][^,.;:]{2,40}, (?:priced|paid|measured|kept|used|sold|charged|counted|timed|on a scale|at a rate|by the|with cause|for a fee|whether|as long as|until|if you|once you)\b[^,.;:]{0,50}\.?$"),
         "label field as 'abstract noun, wry qualifier' (\"cheerful extortion, priced by the hull\"); one plain word or a plain fact",
         fields=("vibe.mood", "vibe.condition")),
    Rule("zero-relative", "hard", _r(r"(?<![,;:.] )(?<!\bfrom )(?<!\bif )(?<!\bon )(?<!\bat )(?<!\bin )(?<!\bwith )(?<!\bby )(?<!\bfor )(?<!\bgive )(?<!\bgives )(?<!\bgave )(?<!\bcalls )(?<!\bcall )(?<!\bcalled )(?<!\bsends )(?<!\bsend )(?<!\bof )(?<!\bto )\b(?:the|a|an|its|their|his|her|this|these|those) (?!(?:that|which|who|whom|where|when|if|so|and|but|or|of|in|on|at|for|to|by|with|from|as|than)\b)[a-z-]+ (?:the|a|an|its|their|his|her|these|those|some|no|every) (?!(?:that|which|who|whom|where|when|if|so|and|but|or|to|of|in|on|at|for|by|with|from)\b)(?:(?!(?:to|of|in|on|at|for|by|with|from)\b)[a-z-]+ )?(?!(?:to|of|in|on|at|for|by|with|from)\b)[a-z-]+ (?:leave|leaves|left|keep|keeps|kept|use|uses|used|call|calls|called|know|knows|knew|hold|holds|held|want|wants|sell|sells|sold|pay|pays|paid|make|makes|made|carry|carries|carried|need|needs|own|owns|owned|trust|trusts|fear|fears|bring|brings|brought|take|takes|took|watch|watches|tend|tends|hunt|hunts|farm|farms|guard|guards|serve|serves|mind|minds|rent|rents|cross|crosses|pole|poles|walk|walks|work|works|fish|fishes|see|sees|hear|hears|remember|remembers|cut|dug|built|gave|give|gives|drink|drinks|eat|eats|read|reads|found|find|finds|lost|lose|loses|buy|buys|bought|send|sends|sent|do|does|did|cannot|will|would|could)\b(?! (?:that|which|who|whom|where)\b)"),
         "zero relative clause (noun + a second subject + verb, no pronoun: 'ground the tribes leave alone') — write the pronoun or turn it round (owner 2026-09-05; style guide §2.8 rule 8)"),
    Rule("soft-idiom", "hard", _r(r"\b(?:leaves?|left|leaving) (?:it |them |him |her |us |[a-z-]+ )?alone\b|\bputs? up with\b|\bmakes? do\b|\bkeeps? to (?:themselves|himself|herself|itself)\b|\bget(?:s)? by\b"),
         "soft modern idiom for a plain fact — the concrete verb (style guide §2.8 rule 9)"),
    Rule("repeat-noun", "soft", _r(r"\b(?:the|a|an) (\w{4,}) (?:named|called|known)[^.]{0,40}\bas (?:the|a|an) \1\b"),
         "a noun repeated inside one sentence for effect (style guide §2.8 rule 5)"),
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
    Rule("duplicate-field", "hard", re.compile(r"(?!)"), f"the same prose field verbatim on ≥{4} records (set-level boilerplate)"),
    Rule("generaliser-heavy", "hard", re.compile(r"(?!)"), f"more than {2} everyone/nobody/nothing/the-only beats in one record"),
    Rule("hook-copies-site", "hard", re.compile(r"(?!)"), "hook is a verbatim copy of why.siteAdvantages (60 §45e.1 echo row)"),
    Rule("the-only-repeat", "hard", re.compile(r"(?!)"), "'the only' more than once in one record (style guide §2.6 cap)"),
]
HARD = [r for r in RULES if r.severity == "hard"] + RECORD_RULES
SOFT = [r for r in RULES if r.severity == "soft"]
# Density thresholds per 1,000 words for the soft rules that are tics at scale.
SOFT_DENSITY_MAX = {"the-only": 1.5, "never": 3.0, "and-closer": 6.0, "will-not-say": 2.0, "ancient": 2.0,
                    "generaliser": 5.0, "none-of": 0.6, "zinger-tail": 1.5}
# Per-record cap for the generaliser class (a record with three "everyone /
# nobody / the only" beats is the tell whatever the province average says).
GENERALISER_RECORD_MAX = 2
# Province-wide ceilings (owner 2026-09-04: overuse is a body-of-text problem,
# not a per-record one). Checked over the whole run, all scopes together.
GLOBAL_DENSITY_MAX = {"generaliser": 4.0, "the-only": 0.8, "never": 2.5, "none-of": 0.3, "zinger-tail": 0.8}
# Design-voice fields: not player-visible, so the provenance/session-voice rule does not apply.
DESIGN_FIELDS = {"questHooks.opportunity"} | {f"{k}.why.playerPurpose" for k in ("districts", "parcels", "landmarks", "docks")}
# The typed `playerPurpose[].note` is the same design-voice record as the
# `why.playerPurpose` sentence beside it, one resolution down: it is what
# Phase 12/13 read to build the thing behind the door, and nobody in the game
# ever reads it. So it names the player, and the canon-marker rule (which
# guards the in-world voice) does not apply — the rest of the register does.
DESIGN_FIELD_PREFIXES = tuple(f"{k}.playerPurpose." for k in ("districts", "parcels", "landmarks", "docks"))
DESIGN_EXEMPT_RULES = {"canon-marker"}


def is_design_field(fld: str) -> bool:
    return fld in DESIGN_FIELDS or fld.startswith(DESIGN_FIELD_PREFIXES)


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
            if rule.id in DESIGN_EXEMPT_RULES and is_design_field(fld):
                continue
            if rule.fields and fld not in rule.fields:
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
    # field-echo (soft): the same 6-word run in two different prose fields of
    # one record — the same image told twice (saxhleel reviewer, 2026-09-04)
    grams: dict[str, str] = {}
    for path in PROSE_PATHS:
        t = _get(rec, path)
        if not t or path in (("sitingNote",), ("questHooks", "opportunity")):
            continue
        words = re.findall(r"[a-z']+", t.lower())
        fname = ".".join(path)
        for i in range(len(words) - 5):
            g = " ".join(words[i:i + 6])
            if g in grams and grams[g] != fname:
                res.hits.append(Hit(rid, fname, "field-echo", "soft", f"'{g}' also in {grams[g]}"))
                res.by_scope_rule[scope]["field-echo"] += 1
                break
            grams.setdefault(g, fname)
    for field_name, text in iter_catalogue_prose(rec):
        res.add_text(scope, rid, field_name, text)


DUP_FIELD_MIN = 4        # the same whole prose field on ≥ this many records = boilerplate (hard)
DUP_NGRAM_MIN = 6        # the same 7-word run on ≥ this many records = a stock phrase (soft)


def lint_catalogue(regions: set[str] | None = None) -> LintResult:
    res = LintResult()
    field_owners: dict[str, list[str]] = defaultdict(list)
    ngram_owners: dict[str, set[str]] = defaultdict(set)
    for rf in catalogue.load_region_files():
        if regions and rf.region not in regions:
            continue
        for rec in rf.places:
            if rec.get("status") in {"cut", "deferred"}:
                continue
            lint_record(res, rec, rf.region)
            # set-level convergence (hist-heartland reviewer, 2026-09-04): the
            # same sentence on fourteen records is one voice however good it is
            for path in PROSE_PATHS:
                if path == ("sitingNote",):      # design rationale, not world prose
                    continue
                t = _get(rec, path)
                if not t:
                    continue
                key = re.sub(r"\s+", " ", t.strip().lower())
                if len(key.split()) >= 4:
                    field_owners[key].append(f"{rec['id']} {'.'.join(path)}")
                words = re.findall(r"[a-z']+", key)
                for i in range(len(words) - 6):
                    ngram_owners[" ".join(words[i:i + 7])].add(rec["id"])
    scope = "convergence"
    for key, owners in sorted(field_owners.items()):
        if len(owners) >= DUP_FIELD_MIN:
            res.hits.append(Hit(owners[0], "set", "duplicate-field", "hard", f"×{len(owners)}: {key[:60]}"))
            res.by_scope_rule[scope]["duplicate-field"] += 1
    seen_phrase: set[str] = set()
    for gram, owners in sorted(ngram_owners.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        if len(owners) < DUP_NGRAM_MIN:
            break
        if any(gram in g for g in seen_phrase):
            continue
        seen_phrase.add(gram)
        res.hits.append(Hit(sorted(owners)[0], "set", "stock-phrase", "soft", f"×{len(owners)}: {gram}"))
        res.by_scope_rule[scope]["stock-phrase"] += 1
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


ROUTE_STRUCTURES = (catalogue.REPO_ROOT / "world" / "sources" / "routes"
                    / "route-structures.json")
AUTHOR_ROUTE_STRUCTURES = Path(__file__).with_name("author_route_structures.py")


def _literal_dict(module_path: Path, name: str) -> dict:
    """The value of a module-level dict literal, read without importing it."""
    tree = ast.parse(module_path.read_text(encoding="utf-8"), str(module_path))
    for node in tree.body:
        targets = (node.targets if isinstance(node, ast.Assign)
                   else [node.target] if isinstance(node, ast.AnnAssign) else [])
        if any(isinstance(t, ast.Name) and t.id == name for t in targets):
            return ast.literal_eval(node.value)
    raise RuntimeError(f"{name} is not a literal assignment in {module_path.name}")


def lint_route_structures(res: LintResult) -> None:
    """Every authored route-structure sentence (Phase 11 stream B): a world
    record's stated reason, held to the same register as a place record's.

    Two sources, because neither alone is the whole surface and either alone
    can silently lint nothing:
    * `author_route_structures.WHY` — the authored dict. It is a module, so it
      is present wherever the gate runs, and it holds sentences for ways the
      last compile did not emit (an author edits WHY before recompiling).
    * the compiled `route-structures.json` — what actually ships, in case a
      sentence reached the file by some other route than WHY.
    Sentences already linted from WHY are not linted twice (the file copies
    them verbatim), so the density figures stay honest.

    A missing or empty surface is a FAILURE, not a clean run: WHY must be
    readable and non-empty, or this raises.

    WHY is read from the module's SOURCE rather than by importing it. The
    linter is part of the repo-standards gate, which CI runs in the Node build
    job with no Python packages installed, and importing
    `author_route_structures` drags in numpy through the grading chain — the
    gate died on `ModuleNotFoundError: numpy` the first time this surface was
    added. The dict is a literal, so `ast` reads it exactly, with no
    dependencies at all.
    """
    why = _literal_dict(AUTHOR_ROUTE_STRUCTURES, "WHY")
    if not isinstance(why, dict) or not why:
        raise RuntimeError("author_route_structures.WHY is missing or empty — "
                           "the route-structure prose surface cannot lint nothing and pass")
    seen_text: set[str] = set()
    for way_id, text in sorted(why.items()):
        if not isinstance(text, str) or not text.strip():
            raise RuntimeError(f"author_route_structures.WHY[{way_id!r}] is not prose")
        seen_text.add(re.sub(r"\s+", " ", text.strip()))
        res.add_text("route-structures", way_id, "why", text)
    if not ROUTE_STRUCTURES.exists():
        return
    seen_way: set[str] = set()
    for s in json.loads(ROUTE_STRUCTURES.read_text(encoding="utf-8")).get("structures", []):
        # one sentence per way, carried by each of its structures: lint it once
        if s["wayId"] in seen_way or not isinstance(s.get("why"), str):
            continue
        seen_way.add(s["wayId"])
        if re.sub(r"\s+", " ", s["why"].strip()) in seen_text:
            continue
        res.add_text("route-structures", s["wayId"], "why", s["why"])


BLUEPRINT_DIR = catalogue.REPO_ROOT / "world" / "sources" / "blueprints"


def lint_blueprints(res: LintResult) -> None:
    """Prose inside settlement blueprints (Part 6+): the causal model, every
    orientationWhy, notes and siting reasons. A building's stated reason is a
    world record and is held to the place-record register."""
    for p in sorted(BLUEPRINT_DIR.glob("place.*.json")):
        bp = json.loads(p.read_text(encoding="utf-8")).get("blueprint", {})
        scope = "blueprints"
        bid = bp.get("id", p.stem)
        for k, v in (bp.get("causalModel") or {}).items():
            res.add_text(scope, bid, f"causalModel.{k}", v)
        sg = bp.get("scaleGrounding") or {}
        if isinstance(sg.get("why"), str):
            res.add_text(scope, bid, "scaleGrounding.why", sg["why"])
        for key in ("districts", "parcels", "landmarks", "docks", "combatSpaces", "questSockets", "variants", "travelServices",
                    "routes", "canals", "boardwalks", "fences", "approaches", "networkTerminals"):
            for item in bp.get(key) or []:
                if not isinstance(item, dict):
                    continue
                for fld in ("notes", "orientationWhy", "why", "rejectedBecause", "ambience", "abutsWhy", "worksWithWhy", "sequence", "wayfinding"):
                    if isinstance(item.get(fld), str):
                        res.add_text(scope, item.get("id", bid), f"{key}.{fld}", item[fld])
                if isinstance(item.get("why"), dict):        # the v2 why block
                    for k, v in item["why"].items():
                        if isinstance(v, str):
                            res.add_text(scope, item.get("id", bid), f"{key}.why.{k}", v)
                # A typed player purpose carries a written note (the sentence
                # naming the concrete thing behind the door). Same class as a
                # why field: it is a world record a reviewer reads.
                for e in item.get("playerPurpose") or []:
                    if isinstance(e, dict) and isinstance(e.get("note"), str):
                        res.add_text(scope, item.get("id", bid),
                                     f"{key}.playerPurpose.{e.get('kind', '?')}.note", e["note"])
        for c in (bp.get("siting") or {}).get("candidates") or []:
            for fld in ("why", "rejectedBecause"):
                if isinstance(c.get(fld), str):
                    res.add_text(scope, c.get("id", bid), f"siting.{fld}", c[fld])
        for a in bp.get("assetConstraints") or []:
            if isinstance(a, str):
                res.add_text(scope, bid, "assetConstraints", a)


def lint_text_catalogue(res: LintResult) -> None:
    """Player-visible strings in packages/text-catalogue (the `text:` values)."""
    if not TEXT_CATALOGUE.exists():
        return
    src = TEXT_CATALOGUE.read_text(encoding="utf-8")
    for m in re.finditer(r'id:\s*"([^"]+)"[\s\S]*?text:\s*"((?:[^"\\]|\\.)*)"', src):
        res.add_text("text-catalogue", m.group(1), "text", m.group(2).replace('\\"', '"'))


# A code span is a name, not prose: it is replaced by one neutral word so the
# sentence still ends on whatever it ended on (audit §6.6).
CODE_SPAN_WORD = "code"
# Blockquotes are NOT skipped (defect found 2026-09-08: a planted blockquote
# carrying "nestled", "testament to" and an and-comma reported zero hits). The
# old rule skipped them by punctuation, so any brief or record whose prose sat
# in a quote escaped the gate. Our own prose is our own prose wherever it is
# indented. What IS exempt is quoted *source material* — words we did not
# write and must not rewrite (a UESP passage, a mod author's description, an
# owner instruction reproduced verbatim) — recognised by an explicit
# attribution on the quote, not by the ">" itself.
_MD_SKIP = re.compile(r"^\s*(?:#|\||```|-\s*\[|\d+\.\s)|^\s*$")
_MD_QUOTE = re.compile(r"^\s*>\s?")
# An attributed quotation of someone else's words: the first quoted line names
# its source. Everything else in a blockquote is ours and is linted.
_QUOTED_SOURCE = re.compile(
    r"^\s*(?:\*\*)?(?:source|quoted?(?: from)?|citation|cited|verbatim|uesp|owner|from)\b\s*[:—-]",
    re.I)


def lint_markdown(res: LintResult, path: Path, table_cells: bool = True) -> None:
    """Prose PARAGRAPHS and (optionally) table cells of a markdown file.

    Paragraphs, not lines (Round A audit §6.6): markdown is hard-wrapped, so a
    line-at-a-time lint read every wrap as a sentence end and reported "the road
    runs from" as a sentence ending on a preposition — 14 of 24 hits on the
    exemplar records were of that kind. Lines are joined until a blank line, a
    heading, a table, a fence or the next list item, and the paragraph is linted
    as one text.

    Headings and links-only lines are skipped. A code span is replaced by a
    neutral word rather than deleted, for the same reason: deleting it left
    "run from `x`" as "run from".
    """
    try:
        scope = str(path.relative_to(catalogue.REPO_ROOT)) if path.is_absolute() else str(path)
    except ValueError:
        scope = str(path)      # a file outside the repo (a scratch review copy)
    para: list[str] = []
    start = 0

    def flush() -> None:
        nonlocal para, start
        text = " ".join(para).strip()
        para = []
        if len(text.split()) >= 4:
            res.add_text(scope, f"{scope}:{start}", "para", text)

    in_code = False
    in_quote = False          # inside a blockquote block
    quote_exempt = False      # …that quotes attributed source material
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip().startswith("```"):
            flush()
            in_code = not in_code
            continue
        if in_code:
            continue
        if _MD_QUOTE.match(line):
            if not in_quote:
                flush()                      # the quote is its own paragraph
                in_quote = True
                quote_exempt = bool(_QUOTED_SOURCE.match(_MD_QUOTE.sub("", line)))
            if quote_exempt:
                continue
            line = _MD_QUOTE.sub("", line)   # lint the quoted prose as prose
        elif in_quote:
            flush()
            in_quote = False
            quote_exempt = False
        clean = re.sub(r"`[^`]*`", CODE_SPAN_WORD, line)
        clean = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", clean)
        if line.lstrip().startswith("|"):
            flush()
            if not table_cells or re.match(r"^\s*\|\s*-", line):
                continue
            for i, cell in enumerate(clean.strip().strip("|").split("|")):
                cell = cell.strip()
                if len(cell.split()) >= 4:
                    res.add_text(scope, f"{scope}:{n}", f"cell{i}", cell)
            continue
        if _MD_SKIP.match(line) and not line.lstrip().startswith("-"):
            flush()
            continue
        text = clean.lstrip("-* ").strip()
        if not text:
            flush()
            continue
        if line.lstrip().startswith(("-", "*")) and para:
            flush()          # a new bullet is a new paragraph
        if not para:
            start = n
        para.append(text)
    flush()


def render_report(res: LintResult, title: str) -> str:
    hard = res.hard_hits()
    lines = [f"# Prose lint — {title}", "",
             "<!-- GENERATED by `python3 -m worldgen.lint_prose`. Do not hand-edit. -->", "",
             f"{res.texts} texts · {res.words:,} words · **{len(hard)} hard hits** · "
             f"{len(res.hits) - len(hard)} soft candidates. Rules: docs/quests/60 §45e.1, docs/standards/text/style-guide.md §2.4–2.6.", ""]
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
    soft = [h for h in res.hits if h.severity == "soft" and h.rule in ("stock-phrase", "and-closer", "and-for-but", "the-only", "will-not-say", "generaliser", "none-of", "zinger-tail", "repeat-noun", "design-voice", "wry-label", "field-echo", "zero-relative", "soft-idiom")]
    for h in soft[:1500]:
        lines.append(f"- `{h.where}` · {h.fld} · {h.rule} — …{h.excerpt}…")
    if len(soft) > 1500:
        lines.append(f"- … {len(soft) - 1500} more")
    return "\n".join(lines) + "\n"


DOCS_BASELINE = catalogue.REPO_ROOT / "docs" / "standards" / "text" / "docs-lint-baseline.json"
DOCS_BASELINE_RULE = ("hard prose hits per docs/ markdown file may only fall; "
                      "a file absent here must have zero")


def _docs_counts() -> tuple[Counter, dict[str, list[Hit]]]:
    """Hard-hit counts per docs/ markdown file, and the hits themselves."""
    res = LintResult()
    for path in sorted((catalogue.REPO_ROOT / "docs").rglob("*.md")):
        lint_markdown(res, path)
    counts: Counter = Counter()
    hits: dict[str, list[Hit]] = defaultdict(list)
    for h in res.hard_hits():
        rel = Path(h.where.rsplit(":", 1)[0]).as_posix()
        counts[rel] += 1
        hits[rel].append(h)
    return counts, hits


def docs_gate(baseline_path: Path, write: bool = False) -> tuple[int, list[str]]:
    """Ratchet gate: a docs/ markdown file may improve, never get worse."""
    counts, hits = _docs_counts()
    if write:
        payload = {
            "schemaVersion": 1,
            "rule": DOCS_BASELINE_RULE,
            "files": {k: counts[k] for k in sorted(counts) if counts[k] > 0},
        }
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        baseline_path.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")
        return 0, [f"baseline written: {baseline_path} ({len(payload['files'])} files)"]

    base: dict[str, int] = {}
    if baseline_path.exists():
        base = json.loads(baseline_path.read_text(encoding="utf-8")).get("files", {})
    msgs: list[str] = []
    rc = 0
    for rel in sorted(set(counts) | set(base)):
        now = counts.get(rel, 0)
        was = int(base.get(rel, 0))
        if now > was:
            rc = 1
            msgs.append(f"{rel}: {now} hard hits, baseline {was}")
            for h in hits[rel][:3]:
                msgs.append(f"    {h.rule} — …{h.excerpt}…")
        elif now < was:
            msgs.append(f"{rel} improved {was} -> {now}; "
                        "run --docs-gate --write-baseline to lower the bar")
    return rc, msgs


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
    ap.add_argument("--docs-gate", action="store_true", help="ratchet gate over docs/**/*.md against docs/standards/text/docs-lint-baseline.json (no catalogue run)")
    ap.add_argument("--write-baseline", action="store_true", help="with --docs-gate: rewrite the baseline from the current counts")
    a = ap.parse_args(argv)
    if a.docs_gate:
        rc, msgs = docs_gate(DOCS_BASELINE, write=a.write_baseline)
        if msgs and (rc or not a.quiet):
            print("\n".join(msgs))
        return rc
    if a.report is None:
        a.report = Path("-") if (a.region or a.no_catalogue) else REPORT_PATH

    res = LintResult() if a.no_catalogue else lint_catalogue(set(a.region) if a.region else None)
    if not a.region and not a.no_catalogue:
        # a whole-catalogue run is the body-of-text run: quest rows and the
        # text catalogue count toward the same province-wide ceilings
        lint_quests(res)
        lint_text_catalogue(res)
        lint_blueprints(res)
        lint_route_structures(res)
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
            print(f"  density {s} {r} = {d}/1k words (max {GLOBAL_DENSITY_MAX[r] if s == 'WHOLE RUN' else SOFT_DENSITY_MAX[r]})")
        if str(a.report) != "-":
            print(f"report: {a.report}")
    if a.strict and (hard or fails):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
