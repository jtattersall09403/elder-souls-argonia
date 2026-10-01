"""shell_guard.py: `sleep` is refused for every agent (owner 2026-09-25); the
exploration words only for the planner (decision 0079)."""
import json
import subprocess
import sys
from pathlib import Path

GUARD = Path(__file__).parent / "shell_guard.py"


def code(cmd, sub):
    d = {"tool_name": "Bash", "tool_input": {"command": cmd}}
    if sub:
        d.update(agent_id="a1", agent_type="run")
    return subprocess.run([sys.executable, str(GUARD)], input=json.dumps(d), text=True,
                          capture_output=True).returncode


def test_sleep_refused_for_planner_and_subagents():
    for cmd in ["sleep 30", "npm run build; sleep 5", "while true; do sleep 5; done",
                "cd x && sleep 1", "(sleep 2; ls)", "timeout 60 sleep 30", "rtk sleep 3"]:
        assert code(cmd, sub=True) == 2, cmd
        assert code(cmd, sub=False) == 2, cmd


def test_sleep_as_a_word_is_not_a_command():
    for cmd in ["echo sleepy", "git commit -m 'no sleep polling'", "python3 x.py --sleep-s 3",
                "grep -n time.sleep x.py"]:
        assert code(cmd, sub=True) == 0, cmd


def test_exploration_words_still_planner_only():
    assert code("grep -rn foo .", sub=False) == 2
    assert code("grep -rn foo .", sub=True) == 0
    assert code("npm test", sub=False) == 0


def test_writing_head_over_the_tree_refused_for_everyone():
    # the 2026-09-30 Riverwalk revert was the second command here
    for cmd in ["git checkout -- world/sources/blueprints/riverwalk.layout.json",
                "git show HEAD:world/sources/a.json > world/sources/a.json",
                "cd x; git show HEAD:a.json >a.json", "git restore world/sources/a.json",
                "git restore --staged a.json", "git stash", "git stash push -- a",
                "git reset --hard", "git checkout HEAD -- a.json", "git checkout .",
                "git -C /workspaces/r checkout -- a.json", "rtk git checkout -- a"]:
        assert code(cmd, sub=True) == 2, cmd
        assert code(cmd, sub=False) == 2, cmd


def test_reading_head_into_a_temp_path_is_allowed():
    for cmd in ["git show HEAD:world/sources/a.json > /tmp/a.json",
                "git show HEAD:a.json | python3 x.py", "git checkout -b lane-x",
                "git commit -m 'restore the stash note' -- a.json", "git checkout main",
                "git show HEAD:a.json > \"$TMPDIR/a.json\"", "git log --oneline -5"]:
        assert code(cmd, sub=True) == 0, cmd


def test_foreground_waits_refused_for_everyone():
    for cmd in ["tail -f log.txt", "tail -n 20 -f x.log", "ls; tail -" + "f x.log", "tail -n 5 x | tail -" + "f y", "tail --pid=123 -f /dev/null", "tail -F x",
                "until [ -f done ]; do true; done", "x=1; until grep -q ok log; do :; done",
                "while ! test -f d; do true; done", "while pgrep x; do echo waiting; done"]:
        assert code(cmd, sub=True) == 2, cmd
        assert code(cmd, sub=False) == 2, cmd


def test_ordinary_loops_and_tail_allowed_for_agents():
    for cmd in ["tail -n 40 log.txt", "tail -20 x.log", "while read l; do echo $l; done < f",
                "for f in a b; do true; echo $f; done", "git commit -m 'until done'", "cat <<'E' > f\nthe batch stays open\n  until the close\nE","grep -n tail x.py",
                "tail -n 50 out.log | grep -F error", "tail -n 5 x.log; rm -rf tmp", "tail -n 3 a && find . -name f"]:
        assert code(cmd, sub=True) == 0, cmd


def run(cmd, agent_type="deliver", agent_id="a1", state=None):
    d = {"tool_name": "Bash", "tool_input": {"command": cmd}, "agent_id": agent_id, "agent_type": agent_type}
    env = {"PATH": "/usr/bin:/bin", "ES_SHELL_GUARD_DIR": str(state or "/tmp/es-shell-guard-test")}
    return subprocess.run([sys.executable, str(GUARD)], input=json.dumps(d), text=True,
                          capture_output=True, env=env)


def test_poll_loopholes_refused_for_everyone():
    """Decision 0118: the r6 polls (Lane B's pgrep one-liner, walk 7's `date; grep` ticks)."""
    for cmd in ["python3 -c \"import time,subprocess\nwhile subprocess.run(['pgrep','-f','x']).returncode==0: time.sleep(5)\"",
                "while pgrep -f build_kit >/dev/null; do wait; done", "for i in 1 2 3; do pgrep x && break; done",
                "date; grep -c ok /tmp/x.log", "date && tail -n 3 /tmp/x.log", "date -u; ls tooling/.reports",
                "python3 -c 'import time; time.sleep(30)'", "while true; do wait $pid; done"]:
        r = run(cmd)
        assert r.returncode == 2 and "run_in_background" in r.stderr and "0118" in r.stderr, cmd
        assert code(cmd, sub=False) == 2, cmd


def test_poll_lookalikes_allowed():
    for cmd in ["pgrep -f build_kit", "date -u +%FT%TZ", "python3 -c 'print(1)'", "git log --since=date",
                "while read l; do echo $l; done < f", "date > /tmp/stamp",
                "sed -i 's#refuses pgrep loops, python sleep one-liners#x#' docs/a.md",
                "cat > /tmp/n.md <<'E'\nwhile pgrep x; do wait; done\nE"]:
        assert run(cmd).returncode == 0, cmd


def test_heredoc_edit_of_tracked_file_refused():
    tracked_file = "tooling/repo-standards/shell_guard.py"
    for cmd in [f"cat > {tracked_file} <<'E2'\nx\nE2", f"cat <<'E' > {tracked_file}\nx\nE",
                f"cat <<'E' >> {tracked_file}\nx\nE", f"tee {tracked_file} <<'E'\nx\nE",
                f"python3 - <<'E'\np='{tracked_file}'\ns=open(p).read()\nopen(p,'w').write(s)\nE",
                f"python3 - <<'E'\nfrom pathlib import Path\nPath('{tracked_file}').write_text('x')\nE"]:
        r = run(cmd)
        assert r.returncode == 2 and "Edit tool" in r.stderr and tracked_file in r.stderr, cmd
        assert code(cmd, sub=False) == 2, cmd


def test_heredoc_after_cd_resolves_the_target():
    """Lane G hit it: `cd tooling/repo-standards && cat >> preflight_select.mjs <<` slipped through."""
    for cmd in ["cd tooling/repo-standards && cat >> preflight_select.mjs <<'E'\nx\nE",
                "cd /workspaces/elder-souls-argonia/tooling; cd repo-standards; tee shell_guard.py <<'E'\nx\nE"]:
        r = run(cmd)
        assert r.returncode == 2 and "Edit tool" in r.stderr, cmd
    assert run("cd /tmp && cat > preflight_select.mjs <<'E'\nx\nE").returncode == 0


def test_heredoc_into_tmp_or_new_file_allowed():
    for cmd in ["cat > /tmp/brief.md <<'E'\nx\nE", "cat <<'E' > tooling/.reports/new-note.md\nx\nE",
                "python3 - <<'E'\nprint(open('tooling/repo-standards/shell_guard.py').read()[:10])\nE",
                "python3 - <<'E'\nopen('/tmp/x.json','w').write('{}')\nE", "git commit -F - <<'E'\nmsg\nE"]:
        assert run(cmd).returncode == 0, cmd


def test_third_single_lookup_in_a_row_nudges_opus_only(tmp_path):
    first, second, third = (run(c, state=tmp_path) for c in ["cat a.py", "grep -n x b.py", "sed -n 1,5p c.py"])
    assert first.stdout == second.stdout == ""
    assert third.returncode == 0 and "batch" in third.stdout and "0118" in third.stdout
    assert run("npm test", state=tmp_path).stdout == ""             # a non-look-up resets the streak
    assert run("cat a; grep x b; ls c", state=tmp_path).stdout == ""  # a batched call is not a single look-up
    for c in ["cat a", "cat b", "cat c"]:
        r = run(c, agent_type="find", agent_id="f1", state=tmp_path)
    assert r.stdout == ""                                           # Haiku `find` is the cheap path
