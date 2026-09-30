#!/usr/bin/env python3
"""PreToolUse hook (decision 0079 §8): preflight is preceded by a code review,
run BY THIS HOOK, so the orchestrator never has to remember it.

On `npm run preflight` (or preflight.mjs):
  0. decision 0106: only CODE is reviewed (.py .ts .tsx .mjs .js under
     packages/ apps/ tooling/); a batch with no code change -> allow, no review
  1. no uncommitted change              -> allow
  2. a stamp for this batch              -> allow (already reviewed)
  3. any stamp recorded at the current HEAD commit (one review per commit
     batch, 0106) -> allow (the fix cycle after a review; a new commit on
     HEAD starts a new batch); a `--range` review never writes a stamp
  4. otherwise run a headless Opus 5.5 review of the WHOLE working-tree code diff (read-only tools),
     write tooling/.reports/review/review-findings.md and the stamp, then
       - no findings -> allow, preflight runs
       - findings    -> exit 2: the findings are the refusal message; the
                        planner acts on CONFIRMED ones or says why not, then
                        re-runs preflight (allowed by rule 3)
A review that cannot run (timeout, CLI error) stamps and allows, and says so
on stderr, so a broken reviewer never blocks work; it is visible in the stamp.

Manual: `python3 tooling/repo-standards/review_gate.py --run` reviews the
uncommitted diff now. `--run --range <rev>[..<rev>]` reviews a COMMITTED diff
instead (`--range db8034db` means `db8034db^..db8034db`), so a change that was
committed before preflight still gets reviewed. A `--range` review never
touches the working-tree stamp: it writes only
tooling/.reports/review/review-findings-range.md and leaves the stamp file
(and therefore the working-tree exemption) alone.

The stamp is keyed to the BATCH, never the pathspec (walk 5 process review:
three callers naming three pathspecs got three reviews of one batch, 22 min):
the key is HEAD plus a hash of the whole working-tree diff (tracked changes
and untracked non-ignored files, `batch_key`). A scoped preflight
(`--paths <pathspec...>`) still fires the gate, but the review reads the whole
tree's code diff and MAX_DIFF_BYTES is measured on it, so the stamp covers
every lane's code and any later preflight or `--run` at the same HEAD passes
whatever pathspec it names. `--run --force` reviews again regardless.
Findings go to tooling/.reports/review/review-findings.md.
"""
import fcntl, hashlib, json, os, re, shlex, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPORT_DIR = os.path.join(ROOT, "tooling", ".reports", "review")
STAMP = os.path.join(REPORT_DIR, "stamp.json")
FINDINGS = os.path.join(REPORT_DIR, "review-findings.md")
FINDINGS_RANGE = os.path.join(REPORT_DIR, "review-findings-range.md")
# a fix round's whole code diff; the reviewer's window is 1M tokens; 0106 decision 13
MAX_DIFF_BYTES = 1_200_000
TIMEOUT_S = 900
MODEL = "claude-opus-5-5[1m]"  # owner 2026-09-19: Opus has headroom, review is judgement; 2026-09-23: Opus 5.5 at medium effort
EFFORT = "high"   # 0106: one exhaustive review per batch, never rounds

PROMPT = """You are the code reviewer for this repo (read CLAUDE.md's golden rules and
docs/standards/engineering.md if you need them; both are short). This is the
ONLY review this batch gets (0106: one thorough review per batch, never
rounds): be exhaustive in one pass, cover every file in the diff, and report
every correctness bug, every standards violation and every scaling problem
you can verify, ranked most severe first. Below is the
{what}. Review it for: correctness bugs; inefficient implementations
where a simpler or cheaper one exists; violations of the engineering standards
(stable IDs, player-visible strings in packages/text-catalogue, schemaVersion,
determinism, no new module-level singletons, credits with assets); and code
that will scale badly for a Skyrim-sized game. Memory (docs/standards/engineering.md,
Memory discipline): for Python/TS that touches meshes, rasters, rays, cells or
kits, is any allocation proportional to A x B (rays x triangles, cells x
pieces, pixels x lights, points x candidate faces) and not chunked
(worldgen/mesh_query.py chunks trimesh ray and closest-point calls)? Is
anything reloaded per item that should be loaded once and shared? Are results
held after their item is done? Do not review prose style in
docs, comments or strings: a separate linter and skill own prose. You may
Read/Grep/Glob the repo to verify a suspicion; verify before you report.

You report SYMPTOMS with evidence. You do NOT propose fixes: the planner finds
the root cause behind the confirmed items and fixes it once, and a suggested
patch from you anchors it on the wrong thing. Before raising any item that is
about design, structure, naming, data shape or "this should be done
differently", Read docs/decisions/README.md (the index of decision records)
and open the record(s) whose titles touch it, and Read the active phase brief
named in docs/PROGRESS.md; if a record already decided it, do not raise it.
Every design-shaped item names the record(s) you checked.

Your report is re-read by the planner on every later turn, so every line is
paid for many times. Write it so: items only, no preamble, no summary of the
diff, no narration of what you checked, no sign-off; each fact once; evidence
is a path:line and at most one quoted line, never a code block; no hedges
("may", "might be worth") and no suggestions. When several items share one
likely cause, say so in one line under the first of them ("same cause as
items 3 and 5: <cause>") rather than describing the cause three times.
CONFIRMED means you read the surrounding code and it is definitely wrong;
PLAUSIBLE means you could not verify it, and you say what would settle it.
An item you could have verified and did not is not raised.

Output ONLY a markdown list, most severe first, at most 12 items, each:
- **CONFIRMED|PLAUSIBLE** `path:line` — one-sentence defect; one-sentence
  failure scenario (concrete input -> wrong result); evidence. No fix.
End with one line: "Coverage: <files read>/<files in diff>".
If nothing is worth raising, output exactly: NO FINDINGS

DIFF:
"""


def _unwrap_job_guard(cmd: str) -> str:
    """The inner command of `[bash] .../job_guard.sh <lane> -- <command...>`
    (job_guard runs `bash -c "$*"`), else `cmd` unchanged. Every heavy job,
    preflight included, runs through job_guard (owner 2026-09-25)."""
    try:
        segs = _segments(cmd)
    except ValueError:
        return cmd
    for toks in segs:
        for i, t in enumerate(toks):
            if os.path.basename(t) == "job_guard.sh" and len(toks) > i + 3 and toks[i + 2] == "--":
                return " ".join(toks[i + 3:])
    return cmd


def is_preflight_command(cmd: str) -> bool:
    """True when `cmd` actually runs preflight (not merely mentions the word)."""
    inner = _unwrap_job_guard(cmd)
    if inner != cmd:
        return is_preflight_command(inner)
    lines, skip_until = [], None
    for line in (cmd or "").splitlines():
        if skip_until is not None:
            if line.strip() == skip_until:
                skip_until = None
            continue
        m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", line)
        if m:
            skip_until = m.group(1)
            line = line[: m.start()]
        lines.append(line)
    text = "\n".join(lines)
    text = re.sub(r"'[^']*'|\"[^\"]*\"", " ", text)
    for seg in re.split(r"&&|\|\||[;|\n()]", text):
        if _runs_preflight(seg.split()):
            return True
    return False


# Commands that run the rest of their line as a command: {name: options that
# take a value}. `timeout` also takes its DURATION before the command.
_WRAPPERS = {"timeout": {"-s", "--signal", "-k", "--kill-after"}, "env": {"-u", "--unset", "-C", "--chdir"},
             "nice": {"-n", "--adjustment"}, "nohup": set(), "time": set(), "command": set(),
             "exec": set(), "sudo": {"-u", "-g", "-C", "-D"}, "stdbuf": {"-i", "-o", "-e"},
             "memwatch.sh": set()}
# npm options before the subcommand that take a value.
_NPM_VALUE_OPTS = {"--prefix", "-C", "-w", "--workspace", "--loglevel", "--userconfig"}


def _strip_wrappers(toks):
    """`toks` with leading env assignments and wrapper commands removed
    (`timeout 600`, `env X=1`, `nice -n 5`, `rtk run`, `.../memwatch.sh`, ...)."""
    toks = list(toks)
    while toks:
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0]):
            toks.pop(0); continue
        name = os.path.basename(toks[0])
        if name == "rtk" and len(toks) > 1 and toks[1] in ("run", "proxy"):
            toks = toks[2:]; continue
        if name not in _WRAPPERS:
            break
        value_opts, toks = _WRAPPERS[name], toks[1:]
        while toks and toks[0].startswith("-"):
            opt = toks.pop(0)
            if opt in value_opts and toks:
                toks.pop(0)
        if name == "timeout" and toks:
            toks.pop(0)
    return toks


def _runs_preflight(toks) -> bool:
    toks = _strip_wrappers(toks)
    if not toks:
        return False
    if toks[0] == "npx":
        rest, i = [], 1
        while i < len(toks):
            if toks[i].startswith("-"):
                i += 2 if toks[i] in ("-p", "--package", "-c", "--call") else 1
                continue
            rest.append(toks[i]); i += 1
        rest = _strip_wrappers(rest)
        return bool(rest) and (rest[0].startswith("preflight") or _runs_preflight(rest))
    if toks[0] == "npm":
        i = 1
        while i < len(toks) and toks[i].startswith("-"):
            i += 2 if toks[i] in _NPM_VALUE_OPTS else 1
        return (len(toks) > i + 1 and toks[i] in ("run", "run-script", "rum", "urn")
                and toks[i + 1].startswith("preflight"))
    return any(os.path.basename(t) in ("preflight.mjs", "preflight.py") for t in toks[:2])


def _segments(cmd: str):
    """Shell-token lists of each simple command in `cmd` (quotes kept as one token)."""
    lex = shlex.shlex(cmd or "", posix=True, punctuation_chars=";&|\n()")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    segs, cur = [], []
    for t in lex:
        if t and set(t) <= set(";&|\n()"):
            segs.append(cur); cur = []
        else:
            cur.append(t)
    segs.append(cur)
    return [s for s in segs if s]


def preflight_paths(cmd: str):
    """The pathspec after `--paths` on the preflight command in `cmd`, or None.

    Tokens after `--paths` up to the next `--flag` are the pathspec. A command
    that cannot be tokenised falls back to None (whole tree, the stricter review).
    """
    cmd = _unwrap_job_guard(cmd)
    # A pathspec the shell computes (`$(git diff ...)`, `$P`, backticks) cannot
    # be read here: review the whole tree rather than a guessed subset.
    # Redirections go first (` 2>&1`, ` > p.log`: never paths); the computed
    # check reads only the preflight command itself, not what follows it.
    cmd = re.sub(r"\s\d*(?:>>?|<)(?:&\d+|\s*[^\s;&|]+)", " ", cmd)
    if "--paths" in cmd and re.search(r"[$`]", re.split(r"[;|&\n]", cmd.split("--paths", 1)[1])[0]):
        return None
    try:
        segs = _segments(cmd)
    except ValueError:
        return None
    for toks in segs:
        if not is_preflight_command(shlex.join(toks)) or "--paths" not in toks:
            continue
        rest = toks[toks.index("--paths") + 1:]
        paths = []
        for t in rest:
            if t.startswith("--"):
                break
            paths.append(t)
        return paths or None
    return None


def argv_paths(argv):
    if "--paths" not in argv:
        return None
    paths = []
    for t in argv[argv.index("--paths") + 1:]:
        if t.startswith("--"):
            break
        paths.append(t)
    return paths or None


def sh(*args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True).stdout


def current_head():
    return sh("git", "rev-parse", "HEAD").strip()


def tree_hash():
    """sha256 of the whole working-tree diff against HEAD: every tracked
    change (binary-safe) plus every untracked non-ignored file's path and blob
    id. Independent of any pathspec."""
    # the gate's own files never move the key (they are gitignored in the repo)
    own = os.path.relpath(os.path.dirname(os.path.abspath(STAMP)), ROOT)
    spec = ("--", ".", f":(exclude){own}") if not own.startswith("..") else ()
    h = hashlib.sha256()
    h.update(subprocess.run(["git", "diff", "HEAD", "--binary", *spec], cwd=ROOT, capture_output=True).stdout)
    others = subprocess.run(["git", "ls-files", "--others", "--exclude-standard", "-z", *spec],
                            cwd=ROOT, capture_output=True).stdout.split(b"\0")
    others = [p for p in others if p]
    if others:
        ids = subprocess.run(["git", "hash-object", "--stdin-paths"], cwd=ROOT, capture_output=True,
                             input=b"\n".join(others) + b"\n").stdout.split()
        for p, oid in zip(others, ids):
            h.update(b"\0untracked\0" + p + b"\0" + oid)
    return h.hexdigest()[:16]


def batch_key(head=None):
    """The stamp key of the current batch: HEAD plus the whole-tree diff hash."""
    return f"{head or current_head()}:{tree_hash()}"


# Design briefs are world prose that text-review owns; each is ~23 KB, so ~11
# of them filled the 250 KB review cap (method review r3 finding D).
# the per-place prose (design briefs, site dossiers) is text-review's, never
# the code reviewer's (method review r3 D; walk 3 L8 rec 6)
EXCLUDE_SPECS = (":(exclude)*.json", ":(exclude)*.lock", ":(exclude)package-lock.json",
                 ":(exclude)world/sources/blueprints/*.design.md",
                 ":(exclude)world/sources/sites/dossiers/*.md")
EXCLUDES = ("--", ".", *EXCLUDE_SPECS)


# Decision 0106 (owner 2026-09-28): the review reads CODE only. Docs, data,
# world records, ledgers and reports are covered by the prose linter, the
# standards checks and the place gates; 13 reviews on 2026-09-28 spent 36.5 M
# tokens, docs-only diffs included.
CODE_FILE = re.compile(r"^(packages|apps|tooling)/.+\.(py|ts|tsx|mjs|js)$")


def is_code(path: str) -> bool:
    return bool(CODE_FILE.match(path))


def range_diff(rng):
    """Code diff of a committed range; a single rev means <rev>^..<rev>."""
    if ".." not in rng:
        rng = f"{rng}^..{rng}"
    files = [f for f in sh("git", "diff", "--name-only", rng, *EXCLUDES).split() if is_code(f)]
    return sh("git", "diff", rng, "--", *files) if files else ""


def current_diff(paths=None):
    """Uncommitted CODE diff (tracked + small untracked code files), limited to `paths` when given."""
    spec = ("--", *paths, *EXCLUDE_SPECS) if paths else EXCLUDES
    files = [f for f in sh("git", "diff", "--name-only", "HEAD", *spec).split() if is_code(f)]
    d = sh("git", "diff", "HEAD", "--", *files) if files else ""
    others = ("--", *paths) if paths else ()
    for path in sh("git", "ls-files", "--others", "--exclude-standard", *others, *EXCLUDE_SPECS).split():
        full = os.path.join(ROOT, path)
        if is_code(path) and os.path.getsize(full) < 60_000:
            with open(full, errors="replace") as f:
                d += f"\n--- new file: {path}\n" + f.read()
    return d


def read_stamps():
    """{key: stamp}. A pre-0087 single stamp reads as key '*'."""
    try:
        d = json.load(open(STAMP))
    except Exception:
        return {}
    if isinstance(d, dict) and isinstance(d.get("stamps"), dict):
        return d["stamps"]
    return {"*": d} if isinstance(d, dict) and "hash" in d else {}


def batch_stamp(head, key):
    """The stamp that exempts this batch: the one for `key`, else any stamp
    recorded at `head` (0106 fix window); {} when none."""
    stamps = read_stamps()
    if key in stamps:
        return stamps[key]
    return next((s for s in stamps.values() if s.get("head") == head), {})


def stamp_lock_path():
    """The stamp's lock file: worldgen.atomic_write.write_lock_path, the one
    convention (decision 0104 decision 9), so no untracked file appears beside
    the stamp. Imported here, not at module top: the hook runs on every Bash call."""
    # the module beside this script, never under ROOT (tests point ROOT at a scratch repo)
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "world-generation"))
    from worldgen.atomic_write import write_lock_path
    path = write_lock_path(STAMP)
    path.parent.mkdir(parents=True, exist_ok=True)
    return str(path)


def write_stamp(key, h, status, n, head=None, paths=None):
    """Add or replace the stamp for batch `key`; stamps from other HEADs are
    dropped (their batch is over). The read-modify-write holds an exclusive flock
    on the stamp's lock file and replaces the stamp file by rename, so
    parallel preflights keep every stamp and a reader never sees a
    half-written file (16k S9: unlocked, 8 writers lost 195 of 200 stamps)."""
    head = head if head is not None else current_head()
    os.makedirs(os.path.dirname(STAMP), exist_ok=True)
    with open(stamp_lock_path(), "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        stamps = {k: s for k, s in read_stamps().items() if s.get("head") == head}
        stamps[key] = {"hash": h, "paths": paths or [], "time": time.time(),
                       "head": head, "status": status, "findings": n}
        fd, tmp = tempfile.mkstemp(prefix=".review-stamp.", dir=os.path.dirname(STAMP))
        try:
            with os.fdopen(fd, "w") as f:
                json.dump({"stamps": stamps}, f)
            os.replace(tmp, STAMP)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise


def review(diff, what):
    prompt = PROMPT.replace("{what}", what)
    env = dict(os.environ); env.pop("CLAUDECODE", None)
    try:
        p = subprocess.run(
            ["claude", "-p", "--model", MODEL, "--effort", EFFORT, "--allowedTools", "Read,Grep,Glob", "--max-turns", "40",
             "--output-format", "text"],
            input=prompt + diff, cwd=ROOT, capture_output=True, text=True, timeout=TIMEOUT_S, env=env)
        return (p.stdout or "").strip(), p.returncode, (p.stderr or "")[-400:]
    except subprocess.TimeoutExpired:
        return "", -1, "timeout"


def main():
    manual = "--run" in sys.argv
    rng = None
    if "--range" in sys.argv:
        i = sys.argv.index("--range")
        if i + 1 >= len(sys.argv):
            sys.stderr.write("[review gate] --range needs a revision or range\n")
            return 2
        rng = sys.argv[i + 1]
    paths = argv_paths(sys.argv)
    force = "--force" in sys.argv
    if not manual:
        try:
            d = json.load(sys.stdin)
        except Exception:
            return 0
        # subagents run preflight since 0079; the gate fires for them too (owner 2026-09-22)
        if d.get("tool_name") != "Bash":
            return 0
        cmd = (d.get("tool_input") or {}).get("command", "")
        if not is_preflight_command(cmd):
            return 0
        paths = preflight_paths(cmd)
        if paths is None and "--paths" not in cmd and "--runner" not in cmd:
            return 0            # 0106: preflight.mjs refuses a bare run; never review for it
    if rng and paths:
        sys.stderr.write("[review gate] --range and --paths cannot be combined\n")
        return 2
    # the batch, never the pathspec: `paths` only fired the gate
    diff = range_diff(rng) if rng else current_diff()
    if not diff.strip():
        if rng:
            print(f"review gate: empty diff for range {rng}")
            return 2
        if manual:
            print("[review gate] the working tree is clean: nothing uncommitted to review. "
                  "To review the last commit, run with `--range HEAD`.")
        return 0
    h = hashlib.sha256(diff.encode()).hexdigest()[:16]
    head = current_head()
    key = None if rng else batch_key(head)
    st = {} if rng or force else batch_stamp(head, key)
    if st:
        if manual:
            print(f"[review gate] this batch was reviewed at HEAD {head[:8]} ({st.get('status')}, "
                  f"{st.get('findings')} findings); `--force` reviews again.")
        return 0
    what = f"diff {rng}" if rng else "uncommitted diff of the whole batch"
    if len(diff) > MAX_DIFF_BYTES:
        sys.stderr.write(f"[review gate] the {what} is {len(diff)//1000} KB, too large for one review; "
                         "commit the finished part first (pathspec), then preflight the rest.\n")
        return 2
    out, rc, err = review(diff, what)
    rel = "review-findings-range.md" if rng else "review-findings.md"
    findings_path = os.path.join(os.path.dirname(FINDINGS), rel)
    if rc != 0 or not out:
        if not rng:
            write_stamp(key, h, f"review failed: {err.strip()[:120]}", 0, head, paths)
        sys.stderr.write(f"[review gate] the automatic review could not run ({err.strip()[:120]}); preflight allowed. "
                         "Run `python3 tooling/repo-standards/review_gate.py --run` to retry.\n")
        return 0
    n = 0 if out.startswith("NO FINDINGS") else sum(1 for l in out.splitlines() if l.lstrip().startswith("- "))
    os.makedirs(os.path.dirname(findings_path), exist_ok=True)
    with open(findings_path, "w") as f:
        f.write(f"# Automatic code review ({MODEL}), diff {h}, {time.strftime('%Y-%m-%d %H:%M')}\n\n{out}\n")
    if not rng:
        write_stamp(key, h, "ok", n, head, paths)
    if n == 0:
        if manual:
            print("NO FINDINGS")
        return 0
    next_step = ("fix, then run `--run` (working tree) or preflight" if rng
                 else f"run preflight again (allowed while HEAD stays {head[:8]})")
    sys.stderr.write(
        f"REVIEW REFUSED: {n} findings in tooling/.reports/review/{rel}\n"
        f"[review gate, decision 0079 §8] a {MODEL} code review of the {what} ran before preflight and "
        f"found {n} item(s) (saved at tooling/.reports/review/{rel}). Act on each CONFIRMED item or say in one line "
        f"why not (a phase plan, an owner ruling, the build-out skeleton); treat PLAUSIBLE items as questions. "
        f"Then {next_step}.\n\n{out}\n")
    return 0 if manual else 2


if __name__ == "__main__":
    sys.exit(main())
