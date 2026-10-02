#!/usr/bin/env python3
"""PreToolUse hook (decision 0079): the planner session may not type
exploratory or waiting shell commands; they belong to the `find` / `run`
agents. Subagents are exempt from the exploration rule, but NOT from the
sleep rule (owner ruling 2026-09-25: the time audit found 21 agent-hours of
`sleep` polling by lane leads waiting on their builders): no agent types
`sleep` in a command; waiting is job_guard.sh's own wait, run_in_background
or the harness hand-back. Nor does any agent write git's copy of a file over
the shared working tree (`git checkout -- <path>`, `git restore`, `git stash`,
`git reset --hard`, `git show REV:path > file` outside /tmp): on 2026-09-30 a
lane lead did that to Riverwalk's layout and blueprint while another lane was
editing them (the rules of the road forbid it; this makes it impossible).
Decision 0118 adds: poll loopholes (pgrep loops, python sleep one-liners,
waiting while-loops, `date; grep` ticks) refused for every agent; a heredoc
that writes a tracked repo file refused for every agent (use Edit); and a
nudge to an Opus agent (deliver, place-builder, lead, research) at its third
single look-up command in a row. Reads the hook JSON on stdin; exit 2 with a
reason on stderr blocks the call and shows the reason to the model.

Set SHELL_GUARD_LOG=1 in the environment to append each decision to
/tmp/shell_guard.log (debugging only).
"""
import json, os, re, sys

BLOCK = re.compile(
    r"(^|[;&|]\s*)(rtk\s+)?("
    r"cat|head|tail|less|more|sed\s+-n|grep|rg|egrep|fgrep|ag|find|tree|"
    r"git\s+(diff|show|grep|blame)|git\s+log(?!\s+-1\b)|"
    r"python3?\s+-\s*<<|python3?\s+-c\s"
    r")\b")

# `sleep` anywhere a command starts: line start, after ; & | ( or a shell
# keyword (`while ...; do sleep 5; done`), or behind timeout/nohup.
SLEEP = re.compile(r"(^|[;&|(\n]\s*|\b(do|then|else|timeout\s+\S+|nohup)\s+)(rtk\s+)?sleep\b")

# Foreground waiting (owner 2026-09-30, walk-6 audit: 203 polls, 145 agent-min):
# following a log, waiting on a pid, `until` loops, and busy loops whose body is
# only `true`/`:`/an "echo waiting". A long job runs with run_in_background.
WAIT = re.compile(
    r"(^|[;&|(\n]\s*)(rtk\s+)?(tail\s+([^|;&\n]*\s)?(-[a-zA-Z]*[fF][a-zA-Z]*|--follow\S*|--pid\S*)(\s|$)|until\s[^\n]*?;\s*do\b)"
    r"|\bdo\s+(true|:)\s*;?\s*done\b"
    r"|\bdo\s+echo\s+[\"']?(waiting|still|polling|not yet)\b")

# Poll loopholes (decision 0118, method review r6: a 20-min `python3 -c ... pgrep`
# wait, 122 `date; grep` polls in 5 min): pgrep inside any loop or beside a
# sleep, a python one-liner that sleeps, a `while` loop that sleeps or polls,
# and a command that starts by printing the date before a look (a poll tick).
POLL = re.compile(
    r"\bwhile\s+(!\s*)?pgrep\b|\b(for|until)\b[^\n]*?\bdo\b[^\n]*\bpgrep\b"
    r"|\bpgrep\b[^\n]*?(;|&&|\|\|)\s*(sleep|wait)\b|\bpgrep\b[^\n]*\btime\.sleep\s*\("
    r"|\bpython3?\s+-c\s[^\n]*\btime\.sleep\s*\("
    r"|\bwhile\b[^\n]*?\bdo\b[^\n]*\b(sleep|pgrep|wait)\b"
    r"|(^|[;&|(\n]\s*)date(\s+[^;&|\n]*)?\s*(;|&&)\s*(rtk\s+)?(grep|tail|cat|ls|wc|pgrep|ps)\b")

# Heredoc edits (decision 0118: 517 heredoc edits by Opus agents in walks 6-8):
# a heredoc whose output lands in a tracked repo file. The Edit tool exists.
REDIRECT = re.compile(r"(?<![<0-9&])>>?\s*([^\s;&|<>]+)|\btee\s+(?:-a\s+)?([^\s;&|<>]+)")
PY_HEREDOC = re.compile(r"\bpython3?\s+-\s*<<")
PY_WRITE = re.compile(r"(?:open\(\s*|Path\(\s*)?['\"]([\w./-]+\.[A-Za-z0-9]+)['\"]\s*(?:,\s*['\"][wa]|\)\.write_text|\)\.write_bytes)"
                      r"|\b(\w+)\s*=\s*['\"]([\w./-]+\.[A-Za-z0-9]+)['\"]")
LOOKUP_ONE = re.compile(r"^\s*(rtk\s+)?(cat|head|tail|sed\s+-n|grep|rg|ls|find|wc|git\s+(log|show|diff|status|grep|blame))\b[^;&|\n]*$")
OPUS = {"deliver", "place-builder", "lead", "research"}
STATE = os.environ.get("ES_SHELL_GUARD_DIR", "/tmp/es-shell-guard")
LOOKUP_NUDGE_AT = 3
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


HEREDOC_START = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?")
RUNS_BODY = re.compile(r"\b(python3?|bash|sh|node)\s+(-\s*)?<<")


def strip_data_heredocs(cmd):
    """The command without the bodies of data heredocs (cat/tee/commit
    messages), so text that mentions `pgrep` or `sleep` is not a wait; a
    heredoc fed to python/bash/sh/node keeps its body (it runs)."""
    out, lines, i = [], cmd.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = HEREDOC_START.search(line)
        i += 1
        if m and not RUNS_BODY.search(line):
            while i < len(lines) and lines[i].strip() != m.group(1):
                i += 1
            if i < len(lines):
                out.append(lines[i])
                i += 1
    return "\n".join(out)


def tracked(path, cwd=None):
    """True when `path` is a file git tracks in this repo."""
    import subprocess
    p = path.strip("'\"")
    if not p or p.startswith(("/tmp", "/dev/", "$")):
        return False
    full = p if os.path.isabs(p) else os.path.join(cwd or REPO, p)
    if not full.startswith(REPO + os.sep):
        return False
    return subprocess.run(["git", "ls-files", "--error-unmatch", os.path.relpath(full, REPO)], cwd=REPO,
                          capture_output=True).returncode == 0


CD = re.compile(r"(?:^|[;&|(\n]\s*)cd\s+([^\s;&|)]+)")


def heredoc_edit(cmd, cwd=None):
    """The tracked file a heredoc writes, or None."""
    if "<<" not in cmd:
        return None
    # `cd x && cat > f <<` writes x/f: follow every cd before the heredoc
    base = cwd or REPO
    for m in CD.finditer(cmd.split("<<", 1)[0]):
        d = m.group(1).strip("'\"")
        base = d if os.path.isabs(d) else os.path.normpath(os.path.join(base, d))
    cwd = base
    for line in cmd.splitlines():
        if "<<" not in line:
            continue
        for m in REDIRECT.finditer(line):
            target = m.group(1) or m.group(2)
            if target and tracked(target, cwd):
                return target
    if PY_HEREDOC.search(cmd):
        body = cmd.split("<<", 1)[1]
        if re.search(r"\.write(_text|_bytes)?\(|['\"][wa]\+?['\"]\s*\)", body):
            for m in PY_WRITE.finditer(body):
                target = m.group(1) or m.group(3)
                if target and tracked(target, cwd):
                    return target
    return None


def lookup_streak(d, cmd):
    """Consecutive single look-up commands by this Opus agent (0 for others)."""
    aid, kind = d.get("agent_id"), (d.get("agent_type") or "").lower()
    if not aid or kind not in OPUS:
        return 0
    os.makedirs(STATE, exist_ok=True)
    path = os.path.join(STATE, re.sub(r"[^\w-]", "_", str(aid)))
    try:
        n = int(open(path).read() or 0)
    except (OSError, ValueError):
        n = 0
    n = n + 1 if LOOKUP_ONE.match(cmd) else 0
    with open(path, "w") as f:
        f.write(str(n))
    return n

# git writing a committed copy over the working tree. `git checkout <branch>`
# (no pathspec) and `git checkout -b` stay allowed; `git show REV:path` into
# /tmp or a pipe stays allowed (reading HEAD's version into a temp path).
TREE_WRITE = re.compile(
    r"(^|[;&|(\n]\s*)(rtk\s+)?git\s+(-C\s+\S+\s+)?("
    r"checkout\s+(\S+\s+)?--(\s|$)|checkout\s+\.(\s|$)|restore\b|stash\b|reset\s+--hard\b|"
    r"show\s+\S*:\S+\s*>(?!\s*/tmp/|\s*/dev/null|\s*\$TMPDIR|\s*\"?\$\{?TMP))")


# Killing by pattern or a stranger's pid (2026-10-02: a child's `pkill -f pod-capture.mjs`
# killed another lane's captures). Allowed: `kill <pid>` beside a pid file of the
# caller's own job, `kill -0`, and job_guard.sh --stop.
KILL = re.compile(r"(^|[;&|(\n]\s*|\bsudo\s+|\bxargs\s+)(rtk\s+)?(pkill|killall|kill\s+-9\s+-1\b|kill\s+(?!-0\b)(-\S+\s+)*[\d$`\"'])")
OWN_JOB = re.compile(r"job_guard\.sh\s+--stop\s|/tmp/[\w.-]+/[^\s;&|]*\.pid|tooling/\.reports/job-guard/")


def main():
    try:
        d = json.load(sys.stdin)
    except Exception:
        return 0
    if d.get("tool_name") != "Bash":
        return 0
    cmd = (d.get("tool_input") or {}).get("command", "")
    # the harness adds agent_id/agent_type to a subagent's hook input (verified 2026-09-19)
    is_sub = bool(d.get("agent_id")) or bool(d.get("agent_type"))
    k = KILL.search(strip_data_heredocs(cmd))
    if k and not (OWN_JOB.search(cmd) and not re.search(r"pkill|killall|-9\s+-1\b", k.group(0))):
        sys.stderr.write(
            "[shell guard] never kill by pattern: stop your own job with "
            "`tooling/repo-standards/job_guard.sh --stop <lane>` (kills only that lane's scope); "
            "another lane's job is its lead's to stop\n")
        return 2
    if SLEEP.search(cmd):
        sys.stderr.write(
            "[shell guard, owner 2026-09-25] no agent runs `sleep`. A heavy job waits for room inside "
            "`bash tooling/repo-standards/job_guard.sh <lane> -- <cmd>`; a long job runs with "
            "run_in_background and you are woken when it exits; a subagent's result arrives by its "
            "hand-back. Never poll.\n")
        return 2
    if WAIT.search(cmd):
        sys.stderr.write(
            "[shell guard, owner 2026-09-30] no foreground waiting (tail -f / tail --pid / until loops / "
            "busy loops). Run any job over 60 s with run_in_background: the harness re-invokes you when it "
            "exits; read its log once then.\n")
        return 2
    if TREE_WRITE.search(cmd):
        sys.stderr.write(
            "[shell guard, owner 2026-09-30] no agent writes git's copy of a file over the shared "
            "working tree (checkout -- / restore / stash / reset --hard / show REV:path > file): "
            "another lane may be editing it. Read HEAD's version into a temp path "
            "(`git show HEAD:<path> > /tmp/x`) and edit the file you own with the Edit tool.\n")
        return 2
    if POLL.search(strip_data_heredocs(cmd)):
        sys.stderr.write(
            "[shell guard, decision 0118] no polling (pgrep loops, python time.sleep one-liners, while-loops "
            "that wait, `date; grep` ticks). Use run_in_background (the harness re-invokes you when the job "
            "exits) or the hand-back of the agent you are waiting on.\n")
        return 2
    try:
        target = heredoc_edit(cmd, d.get("cwd"))
    except Exception:
        target = None
    if target:
        sys.stderr.write(
            f"[shell guard, decision 0118] a heredoc writes the tracked file `{target}`. Edit tracked files "
            "with the Edit tool (Read the range first); a heredoc patch script costs a turn per retry and "
            "skips the prose hook. Heredocs into /tmp stay allowed.\n")
        return 2
    if lookup_streak(d, cmd) >= LOOKUP_NUDGE_AT:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": (
            "[shell guard, decision 0118] third single look-up in a row: batch the next look-ups into one Bash "
            "call, or one `find` brief when more than 3 files need reading. Each turn re-sends your whole context.")}}))
        return 0
    hit = BLOCK.search(cmd)
    if os.environ.get("SHELL_GUARD_LOG"):
        with open("/tmp/shell_guard.log", "a") as f:
            f.write(json.dumps({"sub": is_sub, "agent": d.get("agent_type"), "hit": bool(hit), "cmd": cmd[:80]}) + "\n")
    if is_sub or not hit:
        return 0
    word = hit.group(3).split()[0]
    sys.stderr.write(
        f"[shell guard, decision 0079] `{word}` is not run from the planner session. "
        "Looking things up (cat/grep/sed/find/git log|diff|show, inline python) goes to the `find` agent; "
        "a job that needs waiting goes to the `run` agent or run_in_background, never `sleep`. "
        "Ask the agent the question and act on its few-line answer.\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
