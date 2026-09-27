"""owner_inbox.py: the story builder, the link conversion and the hash skip,
against a fake `gh` on PATH (no network)."""
import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import owner_inbox  # noqa: E402

PROGRESS = textwrap.dedent("""\
    # Progress

    ## Status

    - row

    ## Waiting on user

    - **Walk Claywater** ([brief](phases/16-foundation-and-places/16k-place-loop.md#walk)):
      see the [0099 record](decisions/0099-places.md) and [UESP](https://en.uesp.net/wiki/Lore:Argonia).

    ## Later

    - not this
""")

FAKE_GH = textwrap.dedent('''\
    #!/usr/bin/env python3
    import json, os, sys
    state_f = os.environ["FAKE_GH_STATE"]
    st = json.load(open(state_f))
    a = sys.argv[1:]
    st.setdefault("calls", []).append(a[:2])
    if a[:1] == ["api"] and "/comments" in a[1]:
        print(json.dumps([{**c, "issue_url": "https://api.github.com/repos/o/r/issues/7"}
                          for c in reversed(st.get("comments", []))]))
    elif a[:1] == ["api"]:
        print(json.dumps(([{"number": 3, "pull_request": {}}] + [{"number": 7}]) if st.get("issue") else []))
    elif a[:2] == ["label", "create"]:
        pass
    elif a[:2] == ["issue", "create"]:
        st["issue"] = True; print("https://github.com/o/r/issues/7")
    elif a[:2] == ["issue", "pin"]:
        pass
    elif a[:2] == ["issue", "view"]:
        print(json.dumps({"comments": st.get("comments", [])}))
    elif a[:2] == ["issue", "comment"]:
        st.setdefault("comments", []).append({"body": sys.stdin.read(), "created_at": "2026-09-26T00:00:00Z"})
    json.dump(st, open(state_f, "w"))
''')


def test_story_has_the_three_sections():
    story, digest = owner_inbox.build_story(PROGRESS, ["First change", "Second change"], "https://tunnel.example")
    since, rest = story.split("**Waiting on you**")
    waiting, look = rest.split("**Where to look**")
    assert "**Since the last update**" in since
    assert since.index("First change") < since.index("Second change")
    assert "Walk Claywater" in waiting and "not this" not in story and "- row" not in story
    assert "https://tunnel.example" in look and "blob/dev/docs/PROGRESS.md" in look
    assert f"<!-- waiting-hash: {digest} -->" in story


def test_relative_links_become_github_links():
    out = owner_inbox.absolute_links(owner_inbox.waiting_section(PROGRESS))
    assert f"({owner_inbox.BLOB}docs/phases/16-foundation-and-places/16k-place-loop.md#walk)" in out
    assert f"({owner_inbox.BLOB}docs/decisions/0099-places.md)" in out
    assert "(https://en.uesp.net/wiki/Lore:Argonia)" in out
    assert owner_inbox.absolute_links("[x](../README.md)") == f"[x]({owner_inbox.BLOB}README.md)"


def _run(tmp_path, *args):
    repo = tmp_path / "repo"
    (repo / "docs").mkdir(parents=True, exist_ok=True)
    (repo / "docs" / "PROGRESS.md").write_text(PROGRESS)
    binp = tmp_path / "bin"
    binp.mkdir(exist_ok=True)
    (binp / "gh").write_text(FAKE_GH)
    (binp / "gh").chmod(0o755)
    state = tmp_path / "gh.json"
    if not state.exists():
        state.write_text("{}")
    env = {**os.environ, "PATH": f"{binp}:{os.environ['PATH']}", "FAKE_GH_STATE": str(state),
           "ES_INBOX_REPO": str(repo)}
    env.pop("ES_TUNNEL_URL", None)
    r = subprocess.run([sys.executable, str(HERE / "owner_inbox.py"), *args], env=env,
                       capture_output=True, text=True, timeout=60)
    return r, json.loads(state.read_text())


def test_hash_skip_posts_once_then_skips(tmp_path):
    r, st = _run(tmp_path, "--from-progress", "--if-changed")
    assert r.returncode == 0, r.stderr
    assert len(st["comments"]) == 1 and ["issue", "create"] in st["calls"]
    assert "## Progress update" in st["comments"][0]["body"]
    r, st = _run(tmp_path, "--from-progress", "--if-changed")
    assert len(st["comments"]) == 1 and "unchanged" in r.stdout
    f = tmp_path / "packet.md"
    f.write_text("A walk packet in between.")
    _run(tmp_path, "--post", str(f))                    # a packet is not a story: the skip still holds
    r, st = _run(tmp_path, "--from-progress", "--if-changed")
    assert len(st["comments"]) == 2 and "unchanged" in r.stdout
    r, st = _run(tmp_path, "--from-progress")          # without --if-changed it always posts
    assert len(st["comments"]) == 3


def test_post_file_with_title(tmp_path):
    f = tmp_path / "packet.md"
    f.write_text("Walk the dock.")
    r, st = _run(tmp_path, "--post", str(f), "--title", "Claywater walk packet")
    assert r.returncode == 0
    assert st["comments"][0]["body"].startswith("## Claywater walk packet — ")
    assert "Walk the dock." in st["comments"][0]["body"]


def test_missing_gh_exits_zero(tmp_path):
    env = {**os.environ, "PATH": "/nonexistent"}
    r = subprocess.run([sys.executable, str(HERE / "owner_inbox.py"), "--from-progress"], env=env,
                       capture_output=True, text=True, timeout=60)
    assert r.returncode == 0 and "nothing posted" in r.stdout


def test_attach_url_is_the_blob_link_with_raw():
    url = owner_inbox.raw_image_url("tooling/.reports/16k/claywater-walk-2/plan.png", "dev")
    assert url == ("https://github.com/jtattersall09403/elder-souls-argonia/blob/dev/"
                   "tooling/.reports/16k/claywater-walk-2/plan.png?raw=true")


def test_attach_rewrites_a_named_image_and_appends_the_rest():
    text = "Plan:\n\n![plan](plan.png)\n\nOther ![x](https://example.com/x.png)\n"
    out = owner_inbox.attach_images(
        text, ["tooling/.reports/16k/w/plan.png", "tooling/.reports/16k/w/front.png"],
        "dev", base_dir="tooling/.reports/16k/w")
    blob = "https://github.com/jtattersall09403/elder-souls-argonia/blob/dev/tooling/.reports/16k/w/"
    assert f"![plan]({blob}plan.png?raw=true)" in out
    assert "(plan.png)" not in out and "(https://example.com/x.png)" in out
    assert out.index("**Pictures**") < out.index(f"![front.png]({blob}front.png?raw=true)")
    assert out.count("plan.png?raw=true") == 1


def test_post_with_attach_links_on_the_current_branch(tmp_path):
    repo = tmp_path / "repo"
    shots = repo / "tooling" / ".reports" / "16k" / "w"
    shots.mkdir(parents=True)
    (shots / "plan.png").write_bytes(b"\x89PNG")
    (shots / "front.png").write_bytes(b"\x89PNG")
    git = ["git", "-C", str(repo)]
    subprocess.run([*git, "init", "-q", "-b", "slice-1c"], check=True)
    subprocess.run([*git, "add", "tooling/.reports/16k/w/plan.png"], check=True)
    subprocess.run([*git, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "p"], check=True)
    packet = shots / "packet.md"
    packet.write_text("See ![plan](plan.png).")
    r, st = _run(tmp_path, "--post", str(packet), "--attach", str(shots / "plan.png"), str(shots / "front.png"))
    assert r.returncode == 0, r.stderr
    body = st["comments"][0]["body"]
    blob = "https://github.com/jtattersall09403/elder-souls-argonia/blob/slice-1c/tooling/.reports/16k/w/"
    assert f"![plan]({blob}plan.png?raw=true)" in body
    assert f"![front.png]({blob}front.png?raw=true)" in body
    assert "front.png is not committed" in r.stdout and "plan.png is not committed" not in r.stdout
