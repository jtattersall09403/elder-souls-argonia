#!/usr/bin/env python3
"""PreToolUse hook (decision 0079 §8): preflight is preceded by a code review,
run BY THIS HOOK, so the orchestrator never has to remember it.

On `npm run preflight` (or preflight.mjs):
  1. no uncommitted change              -> allow
  2. stamp matches the current diff      -> allow (already reviewed)
  3. stamp younger than FIX_WINDOW min   -> allow (the fix cycle after a review)
  4. otherwise run a headless Opus (low) review of the diff (read-only tools),
     write .claude/review-findings.md and the stamp, then
       - no findings -> allow, preflight runs
       - findings    -> exit 2: the findings are the refusal message; the
                        planner acts on CONFIRMED ones or says why not, then
                        re-runs preflight (allowed by rule 3)
A review that cannot run (timeout, CLI error) stamps and allows, and says so
on stderr, so a broken reviewer never blocks work; it is visible in the stamp.

Manual: `python3 tooling/repo-standards/review_gate.py --run` reviews now.
"""
import hashlib, json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STAMP = os.path.join(ROOT, ".claude", "review-stamp.json")
FINDINGS = os.path.join(ROOT, ".claude", "review-findings.md")
FIX_WINDOW_MIN = 20
MAX_DIFF_BYTES = 250_000
TIMEOUT_S = 540
MODEL = "opus"  # low effort via the machine-wide modelSettings; owner 2026-09-19: Opus has headroom, review is judgement

PROMPT = """You are the code reviewer for this repo (read CLAUDE.md's golden rules and
docs/standards/engineering.md if you need them; both are short). Below is the
uncommitted diff. Review it for: correctness bugs; inefficient implementations
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


def sh(*args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True).stdout


def current_diff():
    d = sh("git", "diff", "HEAD", "--", ".", ":(exclude)*.json", ":(exclude)*.lock", ":(exclude)package-lock.json")
    for path in sh("git", "ls-files", "--others", "--exclude-standard").split():
        full = os.path.join(ROOT, path)
        if path.endswith((".py", ".ts", ".tsx", ".js", ".mjs", ".md")) and os.path.getsize(full) < 60_000:
            with open(full, errors="replace") as f:
                d += f"\n--- new file: {path}\n" + f.read()
    return d


def read_stamp():
    try:
        return json.load(open(STAMP))
    except Exception:
        return {}


def write_stamp(h, status, n):
    os.makedirs(os.path.dirname(STAMP), exist_ok=True)
    json.dump({"hash": h, "time": time.time(), "status": status, "findings": n}, open(STAMP, "w"))


def review(diff):
    env = dict(os.environ); env.pop("CLAUDECODE", None)
    try:
        p = subprocess.run(
            ["claude", "-p", "--model", MODEL, "--allowedTools", "Read,Grep,Glob", "--max-turns", "40",
             "--output-format", "text"],
            input=PROMPT + diff, cwd=ROOT, capture_output=True, text=True, timeout=TIMEOUT_S, env=env)
        return (p.stdout or "").strip(), p.returncode, (p.stderr or "")[-400:]
    except subprocess.TimeoutExpired:
        return "", -1, "timeout"


def main():
    manual = "--run" in sys.argv
    if not manual:
        try:
            d = json.load(sys.stdin)
        except Exception:
            return 0
        if d.get("tool_name") != "Bash" or d.get("agent_id"):
            return 0
        cmd = (d.get("tool_input") or {}).get("command", "")
        if not is_preflight_command(cmd):
            return 0
    diff = current_diff()
    if not diff.strip():
        return 0
    h = hashlib.sha256(diff.encode()).hexdigest()[:16]
    st = read_stamp()
    if not manual and st.get("hash") == h:
        return 0
    if not manual and time.time() - st.get("time", 0) < FIX_WINDOW_MIN * 60:
        return 0
    if len(diff) > MAX_DIFF_BYTES:
        sys.stderr.write(f"[review gate] the uncommitted diff is {len(diff)//1000} KB, too large for one review; "
                         "commit the finished part first (pathspec), then preflight the rest.\n")
        return 2
    out, rc, err = review(diff)
    if rc != 0 or not out:
        write_stamp(h, f"review failed: {err.strip()[:120]}", 0)
        sys.stderr.write(f"[review gate] the automatic review could not run ({err.strip()[:120]}); preflight allowed. "
                         "Run `python3 tooling/repo-standards/review_gate.py --run` to retry.\n")
        return 0
    n = 0 if out.startswith("NO FINDINGS") else sum(1 for l in out.splitlines() if l.lstrip().startswith("- "))
    with open(FINDINGS, "w") as f:
        f.write(f"# Automatic code review ({MODEL}), diff {h}, {time.strftime('%Y-%m-%d %H:%M')}\n\n{out}\n")
    write_stamp(h, "ok", n)
    if n == 0:
        if manual:
            print("NO FINDINGS")
        return 0
    sys.stderr.write(
        f"[review gate, decision 0079 §8] a {MODEL} code review of the uncommitted diff ran before preflight and "
        f"found {n} item(s) (saved at .claude/review-findings.md). Act on each CONFIRMED item or say in one line "
        f"why not (a phase plan, an owner ruling, the build-out skeleton); treat PLAUSIBLE items as questions. "
        f"Then run preflight again (allowed for {FIX_WINDOW_MIN} min).\n\n{out}\n")
    return 0 if manual else 2


if __name__ == "__main__":
    sys.exit(main())
