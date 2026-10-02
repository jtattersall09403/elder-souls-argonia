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
           "ES_INBOX_REPO": str(repo), "CLAUDE_CONFIG_DIR": str(tmp_path / "claude")}  # no live agents
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


def _git_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir(parents=True, exist_ok=True)
    git = ["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t"]
    subprocess.run([*git, "init", "-q", "-b", "main"], check=True)
    (repo / ".gitignore").write_text("output/\ntooling/.reports/\n")
    subprocess.run([*git, "add", ".gitignore"], check=True)
    subprocess.run([*git, "commit", "-q", "-m", "base"], check=True)
    return repo, git


def test_attach_copies_stages_and_refuses_until_committed(tmp_path):
    """Walk 5: packet pictures linked from gitignored render output 404'd."""
    repo, git = _git_repo(tmp_path)
    renders = repo / "tooling" / "placement-workbench" / "output" / "renders" / "claywater" / "round-03"
    renders.mkdir(parents=True)
    (renders / "plan.png").write_bytes(b"\x89PNG plan")
    (renders / "front.png").write_bytes(b"\x89PNG front")
    walk = repo / "tooling" / ".reports" / "16k" / "walk5"
    walk.mkdir(parents=True)
    packet = walk / "packet.md"
    packet.write_text("See ![plan](../../../placement-workbench/output/renders/claywater/round-03/plan.png).")
    args = ("--post", str(packet), "--attach", str(renders / "plan.png"), str(renders / "front.png"))
    r, st = _run(tmp_path, *args)
    assert r.returncode == 2 and not st.get("comments")
    assert "2 linked image(s) not committed" in r.stderr and "nothing posted" in r.stderr
    pics = "tooling/.reports/16k/walk5/pictures"
    staged = subprocess.run([*git, "diff", "--cached", "--name-only"], capture_output=True, text=True).stdout.split()
    assert staged == [f"{pics}/front.png", f"{pics}/plan.png"]
    assert (repo / pics / "plan.png").read_bytes() == b"\x89PNG plan"
    subprocess.run([*git, "commit", "-q", "-m", "pictures"], check=True)
    r, st = _run(tmp_path, *args)
    assert r.returncode == 0, r.stdout + r.stderr
    body = st["comments"][0]["body"]
    blob = f"https://github.com/jtattersall09403/elder-souls-argonia/blob/main/{pics}/"
    assert f"![plan]({blob}plan.png?raw=true)" in body          # the render link is rewritten to the copy
    assert f"![front.png]({blob}front.png?raw=true)" in body
    assert "output/renders" not in body


def test_attach_links_the_named_branch_and_needs_a_walk(tmp_path):
    repo, git = _git_repo(tmp_path)
    (repo / "shot.png").write_bytes(b"\x89PNG")
    packet = tmp_path / "packet.md"
    packet.write_text("Look.")
    r, _ = _run(tmp_path, "--post", str(packet), "--attach", str(repo / "shot.png"))
    assert r.returncode == 2 and "--walk" in r.stderr
    r, _ = _run(tmp_path, "--post", str(packet), "--attach", str(repo / "shot.png"), "--walk", "w9", "--branch", "dev")
    assert r.returncode == 2 and "(on dev)" in r.stderr         # no dev branch: not committed there
    subprocess.run([*git, "commit", "-q", "-m", "p"], check=True)
    subprocess.run([*git, "branch", "dev"], check=True)
    r, st = _run(tmp_path, "--post", str(packet), "--attach", str(repo / "shot.png"), "--walk", "w9", "--branch", "dev")
    assert r.returncode == 0, r.stderr
    assert "/blob/dev/tooling/.reports/16k/w9/pictures/shot.png?raw=true" in st["comments"][0]["body"]


def test_a_blob_image_link_that_is_not_committed_refuses_the_post(tmp_path):
    _git_repo(tmp_path)
    packet = tmp_path / "packet.md"
    packet.write_text(f"![a]({owner_inbox.REPO_URL}/blob/dev/tooling/placement-workbench/output/renders/a.png?raw=true)"
                      "\n\n![b](https://example.com/b.png)")
    r, st = _run(tmp_path, "--post", str(packet))
    assert r.returncode == 2 and not st.get("comments")
    assert "tooling/placement-workbench/output/renders/a.png (on dev)" in r.stderr
    assert "example.com" not in r.stderr


FAKE_GH_COMMENTS = textwrap.dedent('''\
    #!/usr/bin/env python3
    import json, os, sys
    state_f = os.environ["FAKE_GH_STATE"]
    st = json.load(open(state_f))
    a = sys.argv[1:]
    if a[:3] == ["api", "-X", "PATCH"]:
        cid = int(a[3].rsplit("/", 1)[-1])
        st["comments"][str(cid)]["body"] = json.loads(sys.stdin.read())["body"]
    elif a[:2] == ["api", "--paginate"]:
        for cid, c in st["comments"].items():
            print(json.dumps({"id": int(cid), "created_at": c["created_at"], "body": c["body"]}))
    elif a[:1] == ["api"] and "/issues/comments/" in a[1]:
        print(json.dumps(st["comments"][a[1].rsplit("/", 1)[-1]]))
    elif a[:1] == ["api"]:
        print(json.dumps([{"number": 7}]))
    json.dump(st, open(state_f, "w"))
''')


def _run_comments(tmp_path, *args):
    fake = tmp_path / "bin" / "gh"
    fake.parent.mkdir(exist_ok=True)
    fake.write_text(FAKE_GH_COMMENTS)
    fake.chmod(0o755)
    state = tmp_path / "state.json"
    if not state.exists():
        state.write_text(json.dumps({"comments": {
            "11": {"created_at": "2026-09-25T10:00:00Z", "body": "## Claywater walk packet 1 — x\n\n| item | check |"},
            "12": {"created_at": "2026-09-26T10:00:00Z", "body": "## Progress update — y\n\nbody"}}}))
    env = {**os.environ, "PATH": f"{fake.parent}{os.pathsep}{os.environ['PATH']}",
           "FAKE_GH_STATE": str(state), "CLAUDE_CONFIG_DIR": str(tmp_path / "claude")}
    r = subprocess.run([sys.executable, str(HERE / "owner_inbox.py"), *args], env=env,
                       capture_output=True, text=True, timeout=60)
    return r, json.loads(state.read_text())


def test_list_prints_id_date_and_title(tmp_path):
    r, _ = _run_comments(tmp_path, "--list")
    assert r.returncode == 0, r.stderr
    assert r.stdout.splitlines() == [
        "11  2026-09-25 10:00  ## Claywater walk packet 1 — x",
        "12  2026-09-26 10:00  ## Progress update — y"]


def test_collapse_folds_the_body_once(tmp_path):
    r, st = _run_comments(tmp_path, "--collapse", "11", "--reason", "walk packets are now short")
    assert r.returncode == 0, r.stderr
    body = st["comments"]["11"]["body"]
    assert body.startswith("<details><summary>Superseded packet (collapsed): "
                           "walk packets are now short</summary>\n\n## Claywater walk packet 1")
    assert body.rstrip().endswith("</details>")
    r, st = _run_comments(tmp_path, "--collapse", "11", "--reason", "again")
    assert "already collapsed" in r.stdout and st["comments"]["11"]["body"] == body
    r, _ = _run_comments(tmp_path, "--list")
    assert r.stdout.splitlines()[0] == "11  2026-09-25 10:00  [collapsed] ## Claywater walk packet 1 — x"
    assert st["comments"]["12"]["body"].startswith("## Progress update")


def test_post_while_agents_run_needs_a_live_section():
    """Method review r7 P4: walk 9's close said "nothing pending" with a lead, a child and a pod live."""
    running = [{"id": "a3f4bbaafa43", "type": "lead"}]
    assert owner_inbox.live_section_missing("## Packet\n\nwalk it", []) == ""
    why = owner_inbox.live_section_missing("## Packet\n\nnothing pending", running)
    assert "a3f4bbaafa (lead)" in why and "## Live" in why
    assert owner_inbox.live_section_missing("## Packet\n\n## Live\n\n- lead a3f4 until 14:30", running) == ""
