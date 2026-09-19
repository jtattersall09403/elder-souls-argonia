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
import hashlib, json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STAMP = os.path.join(ROOT, ".claude", "review-stamp.json")
FINDINGS = os.path.join(ROOT, ".claude", "review-findings.md")
FIX_WINDOW_MIN = 20
MAX_DIFF_BYTES = 250_000
TIMEOUT_S = 540
MODEL = "opus"  # low effort via the machine-wide modelSettings; owner 2026-09-19: Opus has headroom, review is judgement

PROMPT = """You are a code reviewer for this repo (read CLAUDE.md's golden rules and
docs/standards/engineering.md if you need them; both are short). Below is the
uncommitted diff. Review it for: correctness bugs; inefficient implementations
where a simpler or cheaper one exists; violations of the engineering standards
(stable IDs, text-catalogue strings, schemaVersion, determinism, no new
module-level singletons, credits with assets); and code that will scale badly
for a Skyrim-sized game. Do not review prose style. You may Read/Grep/Glob the
repo to verify a suspicion; verify before you report.

Output ONLY a markdown list, most severe first, at most 12 items, each:
- **CONFIRMED|PLAUSIBLE** `path:line` — one-sentence defect; one-sentence
  failure scenario (concrete input -> wrong result); one-line suggested fix.
CONFIRMED means you checked the surrounding code and it is definitely wrong.
If nothing is worth raising, output exactly: NO FINDINGS
Things you cannot see: phase plans, owner rulings, the build-out skeleton;
the planner will reject findings that conflict with those, so keep to what the
code itself shows.

DIFF:
"""


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
        if "preflight" not in cmd:
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
