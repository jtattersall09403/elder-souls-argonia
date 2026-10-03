"""Print the pytest file list for a worldgen suite, by DIRECTORY, not by hand.

Why this exists (16h item 6, 2026-09-22). `test:placement` used to name its
forty modules one by one in package.json. Of the 129 `test_*.py` files under
`worldgen/`, the two hand lists between them named 50: seventy-nine test files
were collected by no gate at all, and a test file added by a new agent joined
them silently unless someone remembered to edit a shell string in package.json.
A gate that does not see a test is not a gate.

So the placement suite is now "every test module under `worldgen/`, except the
water suite", and the water suite is the one list left — it is a list because
it is a genuinely separate gate: preflight runs the two in different waves
(memory, `tooling/repo-standards/preflight.mjs`), and running the heavy water
modules twice would cost both the time and the RAM the wave split exists to
save. Everything not named here is placement, so a NEW test file is collected
without touching package.json.

Usage: python3 scripts/select_tests.py placement|water   (from tooling/world-generation)

TEST SELECTION BY TOUCHED PATHS (speed lane 2, S3, 2026-09-27). Under
`npm run preflight -- --paths`, preflight sets ES_TEST_CHANGED (the changed
repo-relative files, newline- or space-separated; paths hold no spaces) and this script prints only the test
files a change can reach, for four suites: placement and water (cwd
tooling/world-generation), pipeline (tooling/asset-pipeline) and workbench
(tooling/placement-workbench). A test is selected when
  * its transitive import closure (a static graph over worldgen/, pipeline/
    and workbench/: `import`, `from`, relative and bare sibling imports, and
    "worldgen.x"-style strings run with -m or importlib) reaches a changed
    .py file, or
  * the test or any module in its closure names a changed file by a literal
    path (a string with a "/" or a file extension, or a `ROOT / "world" /
    "sources"` chain joined), matched as a path suffix or a directory
    prefix. The closure is followed because tests read records through
    imported constants (`mine_abuts.RECORD`, review 2026-09-27); two-segment
    package roots ("tooling/world-generation", "apps/world-studio") are not
    data paths and are ignored. The cost: a kit or world-record change
    selects ~90 % of placement (most tests do read the kits through
    compile_settlement), a code-only change 0-36 % (measured 2026-09-27).
A conftest's closure joins a test's when the test requests one of its
fixtures (by parameter name) or the fixture is autouse. The WHOLE suite is
selected only when a shared file changes (a package __init__, a conftest,
pytest.ini, this script, requirements-test.txt).
DECISION 0106 (owner 2026-09-28, scoped means scoped): a .md, a README and
anything under docs/, tooling/.reports/ or .claude/ selects no test; a DATA
file (world/, apps/world-studio/public/, tooling/*/output/) selects only the
tests whose test-reads row lists it, never by the literal rule (which
selected ~90 % of placement for any kit or record); a non-.py file no
literal names selects nothing (it used to select the whole suite). The full
`--runner` run before a merge to main is the backstop for a missed reader.
Under ES_TEST_CHANGED the tests marked `@pytest.mark.slow` are deselected
(`--deselect`) unless their file was selected by its own inputs: the full
run keeps them. `--summary` prints JSON {suite, total, selected, all,
reasons} for preflight to decide whether the gate runs at all.

A changed .py that no longer exists (deleted, renamed) selects the whole
suite: its importers are no longer in the graph.

THE TEST-READS MAP (lane 3A E, 2026-09-27). `--record-reads` runs each test
file of the suite in its own pytest process with ES_TEST_READS=1, and the
worldgen conftest's audit hook writes which repo data files (world/,
apps/world-studio/public/, tooling/*/output/) each one opened to
tooling/world-generation/output/test-reads.json. A changed DATA file (not
.py) ALSO selects each test whose row lists it, when the row is complete
(recorded alone, `isolated`; starting no child process, whose opens the
hook cannot see; opening no `*cache*` file under an output/ folder, which
would hide the sources behind the cache; from a green run, `passed`) and
fresh (its own `recordedAt` is after the last change to the test file and
every module it imports). The map only
adds to the static literal rule, never removes: a row cannot know a data
file created after it was recorded (review 2026-09-27), so the selection is
the union. Code changes always use the import closure.

  python3 scripts/select_tests.py pipeline --changed a/b.py c/d.json --summary
"""
from __future__ import annotations

import ast
import json
import os
import re
import sys
from functools import lru_cache
from pathlib import Path

WORLDGEN = Path(__file__).resolve().parents[1] / "worldgen"
REPO = Path(__file__).resolve().parents[3]

# The water gate's own modules (npm run test:water). Add a module here only if
# it belongs to the water suite; anything else is collected by placement.
WATER_SUITE = (
    "test_water.py",
    "test_water_invariants.py",
    "test_reroute_lanes.py",
    "test_hydrology_graph.py",
    "test_terrain_preconditions.py",
    "test_terrain_patches.py",
    "test_freeze.py",
    "test_chain_settles.py",
    "test_shape_province.py",
    "test_sculpt.py",
)


def select(suite: str) -> list[str]:
    modules = sorted(p.name for p in WORLDGEN.glob("test_*.py"))
    if suite == "water":
        chosen = [m for m in modules if m in WATER_SUITE]
        unknown = sorted(set(WATER_SUITE) - set(modules))
        if unknown:
            raise SystemExit(
                f"select_tests: WATER_SUITE names {unknown}, which no longer exist "
                f"under {WORLDGEN}; delete the row or restore the module")
        return chosen
    if suite == "placement":
        return [m for m in modules if m not in WATER_SUITE]
    raise SystemExit(f"select_tests: unknown suite {suite!r} (placement|water)")


# ------------------------------------------------------------ selection by touched paths

# suite -> (cwd relative to the repo, how its full run is named on the command line)
SUITES = {
    "placement": "tooling/world-generation",
    "water": "tooling/world-generation",
    "pipeline": "tooling/asset-pipeline",
    "workbench": "tooling/placement-workbench",
}
# import roots: top-level package name -> its directory (repo-relative)
PACKAGES = {
    "worldgen": "tooling/world-generation/worldgen",
    "pipeline": "tooling/asset-pipeline/pipeline",
    "workbench": "tooling/placement-workbench/workbench",
}
GRAPH_DIRS = ["tooling/world-generation/worldgen", "tooling/world-generation/scripts",
              "tooling/asset-pipeline/pipeline", "tooling/placement-workbench/workbench",
              "tooling/placement-workbench/tests", "tooling/placement-workbench"]
SHARED = {
    "tooling/world-generation/conftest.py", "tooling/world-generation/worldgen/conftest.py",
    "tooling/world-generation/worldgen/__init__.py", "tooling/world-generation/pytest.ini",
    "tooling/world-generation/scripts/select_tests.py", "tooling/world-generation/requirements-test.txt",
    "tooling/asset-pipeline/pipeline/__init__.py", "tooling/asset-pipeline/pipeline/conftest.py",
    "tooling/asset-pipeline/pytest.ini", "tooling/asset-pipeline/conftest.py",
    "tooling/placement-workbench/workbench/__init__.py", "tooling/placement-workbench/tests/conftest.py",
    "tooling/placement-workbench/pytest.ini", "tooling/placement-workbench/conftest.py",
}
CONFTESTS = {
    "tooling/world-generation": ["tooling/world-generation/conftest.py",
                                 "tooling/world-generation/worldgen/conftest.py"],
    "tooling/asset-pipeline": ["tooling/asset-pipeline/conftest.py", "tooling/asset-pipeline/pipeline/conftest.py"],
    "tooling/placement-workbench": ["tooling/placement-workbench/conftest.py",
                                    "tooling/placement-workbench/tests/conftest.py"],
}
EXT = re.compile(r"\.(json|jsonl|npy|npz|png|jpg|ktx2|glb|gltf|nif|dds|esp|esm|yaml|yml|csv|txt|md|py|mjs|ts|"
                 r"tsx|xz|gz|bin|obj|blend|toml|ini|sh)$")
# a two-segment literal under these is a package or app root (a module
# locating itself, a subprocess cwd), not a data path: it would select the
# test for every change in that tree
BROAD_ROOTS = {"apps", "packages", "tooling", "world", "docs"}
MODSTR = re.compile(r"^(worldgen|pipeline|workbench)(\.\w+)+$")


def suite_tests(suite: str) -> list[str]:
    """The suite's test files, repo-relative, in collection order."""
    if suite in ("placement", "water"):
        return [f"tooling/world-generation/worldgen/{m}" for m in select(suite)]
    if suite == "pipeline":
        return sorted(p.relative_to(REPO).as_posix()
                      for p in (REPO / "tooling/asset-pipeline/pipeline").glob("test_*.py"))
    if suite == "workbench":
        return sorted(p.relative_to(REPO).as_posix()
                      for p in (REPO / "tooling/placement-workbench/tests").glob("test_*.py"))
    raise SystemExit(f"select_tests: unknown suite {suite!r} ({'|'.join(SUITES)})")


def _chain(node) -> list | None:
    """`ROOT / "world" / "sources"` -> ["world", "sources"]; None when no str part."""
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
        left, right = _chain(node.left), _chain(node.right)
        return (left or []) + (right or []) if (left or right) else None
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    return None


def _norm_literal(text: str) -> str | None:
    text = text.strip().replace("\\", "/")
    for cut in ("{", "*", "%", "<", " "):
        if cut in text:
            text = text[: text.index(cut)].rsplit("/", 1)[0] if "/" in text[: text.index(cut)] else ""
    parts = [x for x in text.split("/") if x not in ("", ".", "..")]
    if not parts:
        return None
    lit = "/".join(parts)
    if len(parts) < 2 and not EXT.search(lit):
        return None
    if len(parts) <= 3 and parts[0] in BROAD_ROOTS and not EXT.search(lit):
        return None           # "apps/world-studio", "packages/game-core/src": a source tree root, not a data path
    if lit == "apps/world-studio/public":
        return None
    return lit


@lru_cache(maxsize=None)
def _scan(rel: str) -> tuple[frozenset, frozenset, bool]:
    """(imported module files, path literals, has slow-marked tests) of one file."""
    path = REPO / rel
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=rel)
    except (OSError, SyntaxError, UnicodeDecodeError):
        return frozenset(), frozenset(), False
    here = path.parent
    deps: set[str] = set()
    lits: set[str] = set()
    slow = False

    def add_module(dotted: str) -> None:
        head, *rest = dotted.split(".")
        if head in PACKAGES:
            base = REPO / PACKAGES[head]
            deps.add(f"{PACKAGES[head]}/__init__.py")
            for n in range(len(rest), 0, -1):
                cand = base.joinpath(*rest[:n])
                for f in (cand.with_suffix(".py"), cand / "__init__.py"):
                    if f.is_file():
                        deps.add(f.relative_to(REPO).as_posix())
                        return
            return
        # a bare module (sys.path-style import): beside the file, or in a
        # folder above it inside tooling/ (`sys.path.insert(0, HERE.parent)`
        # then `import wb`, review 2026-09-27)
        d = here
        while d != REPO / "tooling" and REPO in d.parents:
            sib = d / f"{head}.py"
            if sib.is_file():
                deps.add(sib.relative_to(REPO).as_posix())
                return
            d = d.parent

    def package_of(level: int) -> str | None:
        d = here
        for _ in range(level - 1):
            d = d.parent
        for name, pdir in PACKAGES.items():
            prel = (REPO / pdir)
            if d == prel or prel in d.parents:
                return ".".join([name, *d.relative_to(prel).parts])
        return None

    inner: set[int] = set()                             # sub-chains of a longer `a / "b" / "c"` path
    for node in ast.walk(tree):
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            inner.add(id(node.left))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                add_module(a.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                pkg = package_of(node.level)
                if pkg is None:
                    base = here
                    for _ in range(node.level - 1):
                        base = base.parent
                    for a in node.names:
                        f = base / f"{(node.module or a.name).split('.')[0]}.py"
                        if f.is_file():
                            deps.add(f.relative_to(REPO).as_posix())
                    continue
                mod = f"{pkg}.{node.module}" if node.module else pkg
            else:
                mod = node.module or ""
            add_module(mod)
            for a in node.names:                        # `from pkg import module`
                add_module(f"{mod}.{a.name}")
        elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            parts = None if id(node) in inner else _chain(node)   # outermost chain only: its prefixes are directories
            if parts:
                lit = _norm_literal("/".join(parts))
                if lit:
                    lits.add(lit)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            v = node.value
            if MODSTR.match(v):
                add_module(v)
            elif len(v) < 300 and "\n" not in v and ("/" in v or EXT.search(v)):
                lit = _norm_literal(v)
                if lit:
                    lits.add(lit)
        elif isinstance(node, ast.Attribute) and node.attr == "slow" and isinstance(node.value, ast.Attribute) \
                and node.value.attr == "mark":
            slow = True
    deps.discard(rel)
    return frozenset(deps), frozenset(lits), slow


@lru_cache(maxsize=None)
def _fixtures(rel: str) -> tuple[frozenset, bool]:
    """(fixture names a conftest defines, whether any is autouse)."""
    tree = ast.parse((REPO / rel).read_text(encoding="utf-8"))
    names, autouse = set(), False
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for d in node.decorator_list:
                text = ast.unparse(d)
                if "fixture" in text:
                    names.add(node.name)
                    autouse |= "autouse=True" in text
    return frozenset(names), autouse


@lru_cache(maxsize=None)
def _arg_names(rel: str) -> frozenset:
    """Every function parameter name in a test file (the fixtures it can request)."""
    tree = ast.parse((REPO / rel).read_text(encoding="utf-8"))
    return frozenset(a.arg for node in ast.walk(tree) if isinstance(node, ast.arguments)
                     for a in [*node.posonlyargs, *node.args, *node.kwonlyargs])


def _closure(rel: str) -> set[str]:
    seen, todo = set(), [rel]
    while todo:
        f = todo.pop()
        if f in seen:
            continue
        seen.add(f)
        todo.extend(_scan(f)[0])
    return seen


def _literal_hits(lit: str, changed: str) -> bool:
    return (changed == lit or changed.endswith("/" + lit) or f"/{lit}/" in f"/{changed}"
            or lit.endswith("/" + changed) or lit == changed)


READS_MAP = REPO / "tooling/world-generation/output/test-reads.json"
DATA_ROOTS = ("world/", "apps/world-studio/public/")


PROSE_ROOTS = ("docs/", "tooling/.reports/", ".claude/")


def selects_nothing(rel: str) -> bool:
    """Decision 0106 (owner 2026-09-28): prose, READMEs and reports select no
    test. The prose linter and the review read them; no test does, and a
    README inside a suite folder used to select the whole suite."""
    name = rel.rsplit("/", 1)[-1]
    return rel.endswith(".md") or name.startswith("README") or rel.startswith(PROSE_ROOTS)


def _is_data(rel: str) -> bool:
    if rel.endswith(".py"):
        return False
    parts = rel.split("/", 3)
    return rel.startswith(DATA_ROOTS) or (len(parts) >= 4 and parts[0] == "tooling" and parts[2] == "output")


def reads_map(suite: str, path: Path = READS_MAP) -> dict:
    """{test: (set of data files it opened, recordedAt)} for the suite's
    tests with a complete row; {} when the map is absent. Freshness is per
    row, in `select_changed`: a row is not used when the test file or any
    module it imports changed after that row's own recording."""
    try:
        doc = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    if doc.get("schemaVersion") != 1:
        return {}
    out = {}
    for t in suite_tests(suite):
        row = doc.get("tests", {}).get(t)
        if not row or not row.get("isolated") or row.get("spawns", True) or not row.get("passed"):
            continue                                      # incomplete: a cache, a child process, or a red run
        if not isinstance(row.get("recordedAt"), (int, float)):
            continue
        reads = set(row.get("reads", ()))
        if any("/output/" in r and "cache" in r.rsplit("/output/", 1)[1] for r in reads):
            continue                                      # its sources hide behind a cache
        out[t] = (reads, float(row["recordedAt"]))
    return out


def _fresh(files: set[str], stamp: float) -> bool:
    """No file of the test's closure changed after the map was recorded."""
    for f in files:
        try:
            if (REPO / f).stat().st_mtime > stamp:
                return False
        except OSError:
            return False
    return True


def select_changed(suite: str, changed: list[str], use_reads_map: bool = True) -> dict:
    """{suite, total, selected: [test files, repo-relative], all, reasons: {test: why}, slow: [...]}"""
    cwd = SUITES[suite]
    tests = suite_tests(suite)
    changed = sorted({c.strip().removeprefix("./") for c in changed if c.strip()})
    changed = [c for c in changed if not selects_nothing(c)]   # prose and reports: no test reads them (0106)
    # a deleted or renamed module: its importers are not in the graph any more
    gone = [c for c in changed if c.endswith(".py") and not (REPO / c).exists()
            and c.startswith(("tooling/world-generation/", "tooling/asset-pipeline/", "tooling/placement-workbench/"))]
    if gone:
        return {"suite": suite, "total": len(tests), "selected": tests, "all": True,
                "reasons": {"*": f"module deleted or renamed: {gone[0]}"}}
    shared = [c for c in changed if c in SHARED]
    if shared:
        return {"suite": suite, "total": len(tests), "selected": tests, "all": True,
                "reasons": {"*": f"shared file changed: {shared[0]}"}}
    confs = [c for c in CONFTESTS[cwd] if (REPO / c).is_file()]
    conf_fixtures = {c: _fixtures(c) for c in confs}
    reasons: dict[str, str] = {}
    mapped = reads_map(suite) if use_reads_map else {}
    data_changed = [c for c in changed if _is_data(c)]
    literal_changed = [c for c in changed if not _is_data(c)]   # data selects by the reads map only (0106)
    for t in tests:
        files = _closure(t)
        used = _arg_names(t)
        for c in confs:                                   # a conftest reaches a test through the fixtures it uses
            names, autouse = conf_fixtures[c]
            files.add(c)
            if autouse or used & names:
                files |= _closure(c)
        why = None
        for c in changed:
            if c in files:
                why = f"imports {c}" if c != t else "changed"
                break
        if why is None:                                   # literal paths in the test and its direct imports
            for f in [t, *sorted(files - {t})]:
                for lit in sorted(_scan(f)[1]):
                    hit = next((c for c in literal_changed if _literal_hits(lit, c)), None)
                    if hit:
                        why = f"{'names' if f == t else f.rsplit('/', 1)[-1] + ' names'} {lit!r} ({hit})"
                        break
                if why:
                    break
        if why is None and t in mapped and _fresh(files, mapped[t][1]):   # the map ADDS readers the literals miss
            hit = next((c for c in data_changed if c in mapped[t][0]), None)
            if hit:
                why = f"opened {hit} (test-reads map)"
        if why:
            reasons[t] = why
    selected = [t for t in tests if t in reasons]
    return {"suite": suite, "total": len(tests), "selected": selected, "all": False, "reasons": reasons}


def slow_deselects(suite: str, result: dict) -> list[str]:
    """--deselect ids for slow-marked tests whose file was not selected by its own inputs."""
    out = []
    for t in result["selected"]:
        if not _scan(t)[2]:
            continue
        why = result["reasons"].get(t, "")
        if not result["all"] and (why == "changed" or why.startswith("imports ")):
            continue                                      # its inputs changed: keep it
        tree = ast.parse((REPO / t).read_text(encoding="utf-8"))
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and any(
                    "slow" in ast.unparse(d) for d in node.decorator_list):
                out.append(f"{os.path.relpath(REPO / t, REPO / SUITES[suite])}::{node.name}")
    return out


def command_args(suite: str, changed: list[str] | None) -> list[str]:
    """What the suite's npm script passes to pytest."""
    if changed is None:
        if suite in ("placement", "water"):
            return [f"worldgen/{name}" for name in select(suite)]
        return []                                         # the suite's testpaths
    result = select_changed(suite, changed)
    files = [os.path.relpath(REPO / t, REPO / SUITES[suite]) for t in result["selected"]]
    if not files:                                         # preflight skips such a gate; never run "everything"
        return []
    return files + [f"--deselect={d}" for d in slow_deselects(suite, result)]


def record_reads(suite: str, only: list[str] | None = None) -> int:
    """Run each test file of the suite alone under ES_TEST_READS=1 (so every
    row is complete), ES_JOB_CORES files at a time; returns 0, or 1 when a
    file's run failed (its row is written with passed=false and not used)."""
    import subprocess
    from concurrent.futures import ThreadPoolExecutor
    cwd = REPO / SUITES[suite]
    files = [os.path.relpath(REPO / t, cwd) for t in suite_tests(suite)]
    if only:
        files = [f for f in files if f in only or os.path.basename(f) in only]
    env = {**os.environ, "ES_TEST_READS": "1"}

    def run(f: str) -> tuple[str, int]:
        cmd = [sys.executable, "-m", "pytest", "-q", "-p", "no:xdist", "-p", "no:randomly",
               "-p", "no:cacheprovider", f]
        return f, subprocess.run(cmd, cwd=cwd, env=env, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL).returncode
    with ThreadPoolExecutor(max(1, int(os.environ.get("ES_JOB_CORES", "2")))) as pool:
        codes = list(pool.map(run, files))
    bad = [f for f, code in codes if code not in (0, 5)]
    print(f"record-reads: {len(files)} files, {len(bad)} red: {' '.join(bad)}".rstrip(": "))
    return 1 if bad else 0


def main() -> None:
    args = sys.argv[1:]
    suite = args[0] if args and not args[0].startswith("--") else "placement"
    if "--changed" in args:
        i = args.index("--changed")
        changed = [a for a in args[i + 1:] if not a.startswith("--")]
    elif os.environ.get("ES_TEST_CHANGED") is not None:
        changed = os.environ["ES_TEST_CHANGED"].split()   # newline- or space-separated
    else:
        changed = None
    if "--record-reads" in args:
        raise SystemExit(record_reads(suite, [a for a in args[1:] if not a.startswith("--")]))
    if "--summary" in args:
        if changed is None:
            raise SystemExit("select_tests: --summary needs --changed or ES_TEST_CHANGED")
        r = select_changed(suite, changed)
        r["deselect"] = slow_deselects(suite, r)
        print(json.dumps(r))
        return
    out = command_args(suite, changed)
    if out:                                               # an empty selection prints nothing
        print(" ".join(out))


if __name__ == "__main__":
    main()
