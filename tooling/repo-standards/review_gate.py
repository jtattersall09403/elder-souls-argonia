#!/usr/bin/env python3
"""PreToolUse hook (decision 0079 §8): preflight is preceded by a code review,
run BY THIS HOOK, so the orchestrator never has to remember it.

On `npm run preflight` (or preflight.mjs):
  1. no uncommitted change              -> allow
  2. stamp matches the current diff      -> allow (already reviewed)
  3. a WORKING-TREE stamp younger than FIX_WINDOW min -> allow (the fix cycle
     after a review); a `--range` stamp never exempts the working-tree diff
  4. otherwise run a headless Opus 5.5 (medium) review of the diff (read-only tools),
     write .claude/review-findings.md and the stamp, then
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
touches the working-tree stamp: it writes only .claude/review-findings-range.md
and leaves the stamp file (and therefore the working-tree exemption) alone.

Pathspec (decision 0087 §3): `npm run preflight -- --paths <pathspec...>` (the
hook reads it from the command) or `--run --paths <pathspec...>` reviews only
`git diff HEAD -- <pathspec>` plus untracked files under it, and MAX_DIFF_BYTES
is measured on that diff alone. Stamps are keyed by the pathspec: a stamp (and
its fix window) satisfies only a later run with the same pathspec, so one
lane's review never masks another's or the whole tree's. Findings for a
pathspec go to .claude/review-findings-<key>.md. No --paths: whole tree, as
before.
"""
import hashlib, json, os, re, shlex, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STAMP = os.path.join(ROOT, ".claude", "review-stamp.json")
FINDINGS = os.path.join(ROOT, ".claude", "review-findings.md")
FINDINGS_RANGE = os.path.join(ROOT, ".claude", "review-findings-range.md")
FIX_WINDOW_MIN = 20
MAX_DIFF_BYTES = 250_000
TIMEOUT_S = 540
MODEL = "claude-opus-5-5[1m]"  # owner 2026-09-19: Opus has headroom, review is judgement; 2026-09-23: Opus 5.5 at medium effort
EFFORT = "medium"

PROMPT = """You are the code reviewer for this repo (read CLAUDE.md's golden rules and
docs/standards/engineering.md if you need them; both are short). Below is the
{what}. Review it for: correctness bugs; inefficient implementations
where a simpler or cheaper one exists; violations of the engineering standards
(stable IDs, player-visible strings in packages/text-catalogue, schemaVersion,
determinism, no new module-level singletons, credits with assets); and code
that will scale badly for a Skyrim-sized game. Do not review prose style in
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
If nothing is worth raising, output exactly: NO FINDINGS

DIFF:
"""


def is_preflight_command(cmd: str) -> bool:
    """True when `cmd` actually runs preflight (not merely mentions the word)."""
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
    for seg in re.split(r"&&|\|\||[;|\n]", text):
        toks = seg.split()
        while toks and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0]):
            toks.pop(0)
        if not toks:
            continue
        if toks[0] == "npm" and len(toks) > 2 and toks[1] == "run" and toks[2].startswith("preflight"):
            return True
        if toks[0] == "npx" and any(t == "preflight" or t.startswith("preflight") for t in toks[1:]):
            return True
        if any(os.path.basename(t) in ("preflight.mjs", "preflight.py") for t in toks[:2]):
            return True
    return False


def _segments(cmd: str):
    """Shell-token lists of each simple command in `cmd` (quotes kept as one token)."""
    lex = shlex.shlex(cmd or "", posix=True, punctuation_chars=";&|\n")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    segs, cur = [], []
    for t in lex:
        if t and set(t) <= set(";&|\n"):
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


def stamp_key(paths):
    """'*' for the whole tree; else the sorted pathspec joined by NUL."""
    return "*" if not paths else "\0".join(sorted(paths))


def sh(*args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True).stdout


EXCLUDE_SPECS = (":(exclude)*.json", ":(exclude)*.lock", ":(exclude)package-lock.json")
EXCLUDES = ("--", ".", *EXCLUDE_SPECS)


def range_diff(rng):
    """Diff of a committed range; a single rev means <rev>^..<rev>."""
    if ".." not in rng:
        rng = f"{rng}^..{rng}"
    return sh("git", "diff", rng, *EXCLUDES)


def current_diff(paths=None):
    """Uncommitted diff (tracked + small untracked text files), limited to `paths` when given."""
    spec = ("--", *paths, *EXCLUDE_SPECS) if paths else EXCLUDES
    d = sh("git", "diff", "HEAD", *spec)
    others = ("--", *paths) if paths else ()
    for path in sh("git", "ls-files", "--others", "--exclude-standard", *others).split():
        full = os.path.join(ROOT, path)
        if path.endswith((".py", ".ts", ".tsx", ".js", ".mjs", ".md")) and os.path.getsize(full) < 60_000:
            with open(full, errors="replace") as f:
                d += f"\n--- new file: {path}\n" + f.read()
    return d


def read_stamps():
    """{key: stamp}. A pre-0087 single stamp is the whole-tree ('*') stamp."""
    try:
        d = json.load(open(STAMP))
    except Exception:
        return {}
    if isinstance(d, dict) and isinstance(d.get("stamps"), dict):
        return d["stamps"]
    return {"*": d} if isinstance(d, dict) and "hash" in d else {}


def read_stamp(paths=None):
    return read_stamps().get(stamp_key(paths), {})


def write_stamp(h, status, n, paths=None):
    os.makedirs(os.path.dirname(STAMP), exist_ok=True)
    stamps = read_stamps()
    stamps[stamp_key(paths)] = {"hash": h, "paths": paths or [], "time": time.time(), "status": status, "findings": n}
    with open(STAMP, "w") as f:
        json.dump({"stamps": stamps}, f)


def findings_rel(paths):
    if not paths:
        return "review-findings.md"
    return f"review-findings-{hashlib.sha256(stamp_key(paths).encode()).hexdigest()[:8]}.md"


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
    if rng and paths:
        sys.stderr.write("[review gate] --range and --paths cannot be combined\n")
        return 2
    diff = range_diff(rng) if rng else current_diff(paths)
    if not diff.strip():
        if rng:
            print(f"review gate: empty diff for range {rng}")
            return 2
        if manual and paths:
            print(f"[review gate] nothing uncommitted under {' '.join(paths)}.")
        elif manual:
            print("[review gate] the working tree is clean: nothing uncommitted to review. "
                  "To review the last commit, run with `--range HEAD`.")
        return 0
    h = hashlib.sha256(diff.encode()).hexdigest()[:16]
    st = {} if rng else read_stamp(paths)
    if not manual and st.get("hash") == h:
        return 0
    if not manual and time.time() - st.get("time", 0) < FIX_WINDOW_MIN * 60:
        return 0
    what = f"diff {rng}" if rng else (f"uncommitted diff of {' '.join(paths)}" if paths else "uncommitted diff")
    if len(diff) > MAX_DIFF_BYTES:
        sys.stderr.write(f"[review gate] the {what} is {len(diff)//1000} KB, too large for one review; "
                         "commit the finished part first (pathspec), or review only your own files "
                         "with `npm run preflight -- --paths <pathspec...>`.\n")
        return 2
    out, rc, err = review(diff, what)
    rel = "review-findings-range.md" if rng else findings_rel(paths)
    findings_path = os.path.join(os.path.dirname(FINDINGS), rel)
    if rc != 0 or not out:
        if not rng:
            write_stamp(h, f"review failed: {err.strip()[:120]}", 0, paths)
        sys.stderr.write(f"[review gate] the automatic review could not run ({err.strip()[:120]}); preflight allowed. "
                         "Run `python3 tooling/repo-standards/review_gate.py --run` to retry.\n")
        return 0
    n = 0 if out.startswith("NO FINDINGS") else sum(1 for l in out.splitlines() if l.lstrip().startswith("- "))
    os.makedirs(os.path.dirname(findings_path), exist_ok=True)
    with open(findings_path, "w") as f:
        f.write(f"# Automatic code review ({MODEL}), diff {h}, {time.strftime('%Y-%m-%d %H:%M')}\n\n{out}\n")
    if not rng:
        write_stamp(h, "ok", n, paths)
    if n == 0:
        if manual:
            print("NO FINDINGS")
        return 0
    same = " with the same --paths" if paths else ""
    next_step = ("fix, then run `--run` (working tree) or preflight" if rng
                 else f"run preflight again{same} (allowed for {FIX_WINDOW_MIN} min)")
    sys.stderr.write(
        f"REVIEW REFUSED: {n} findings in .claude/{rel}\n"
        f"[review gate, decision 0079 §8] a {MODEL} code review of the {what} ran before preflight and "
        f"found {n} item(s) (saved at .claude/{rel}). Act on each CONFIRMED item or say in one line "
        f"why not (a phase plan, an owner ruling, the build-out skeleton); treat PLAUSIBLE items as questions. "
        f"Then {next_step}.\n\n{out}\n")
    return 0 if manual else 2


if __name__ == "__main__":
    sys.exit(main())
